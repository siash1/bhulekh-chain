"""
Tests for the TitleProofAnchor Algorand smart contract.

These tests use algokit_utils testing utilities with a localnet Algorand
instance. Each test operates against a freshly deployed contract to ensure
isolation.

Prerequisites:
    - algokit localnet must be running: `algokit localnet start`
    - Contract must be compiled: `algokit compile py contracts/title_proof.py`

Run with:
    pytest tests/test_title_proof.py -v
"""

from pathlib import Path

import pytest
from algokit_utils import (
    AlgorandClient,
    AppClient,
    AppFactory,
    AppFactoryCreateParams,
    LogicError,
)


@pytest.fixture(scope="session")
def algorand() -> AlgorandClient:
    """Create an AlgorandClient connected to localnet."""
    return AlgorandClient.default_localnet()


@pytest.fixture(scope="session")
def app_spec_path() -> Path:
    """Locate the compiled application specification."""
    project_root = Path(__file__).parent.parent
    candidates = [
        project_root / "artifacts" / "TitleProofAnchor" / "application.json",
        project_root / "artifacts" / "title_proof" / "TitleProofAnchor.arc32.json",
        project_root / "artifacts" / "TitleProofAnchor.arc32.json",
        project_root / "artifacts" / "TitleProofAnchor" / "TitleProofAnchor.arc56.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    pytest.skip(
        "Compiled application spec not found. "
        "Run 'algokit compile py contracts/title_proof.py' first."
    )


@pytest.fixture
def creator(algorand: AlgorandClient) -> str:
    """
    Get the localnet dispenser account as the contract creator.

    Returns:
        The address string of the creator account.
    """
    account = algorand.account.localnet_dispenser()
    return account.address


@pytest.fixture
def authority_account(algorand: AlgorandClient) -> str:
    """
    Create a funded account to serve as the anchor authority.

    Returns:
        The address string of the authority account.
    """
    account = algorand.account.random()
    # Fund the account from the localnet dispenser
    dispenser = algorand.account.localnet_dispenser()
    algorand.send.payment(
        sender=dispenser.address,
        receiver=account.address,
        amount=10_000_000,  # 10 ALGO
    )
    return account.address


@pytest.fixture
def unauthorized_account(algorand: AlgorandClient) -> str:
    """
    Create a funded account that is NOT the anchor authority.

    Returns:
        The address string of the unauthorized account.
    """
    account = algorand.account.random()
    dispenser = algorand.account.localnet_dispenser()
    algorand.send.payment(
        sender=dispenser.address,
        receiver=account.address,
        amount=10_000_000,  # 10 ALGO
    )
    return account.address


@pytest.fixture
def deployed_app(
    algorand: AlgorandClient,
    app_spec_path: Path,
    creator: str,
) -> AppClient:
    """
    Deploy a fresh TitleProofAnchor contract instance.

    Returns:
        An AppClient connected to the newly deployed application.
    """
    factory = AppFactory(
        algorand=algorand,
        app_spec=app_spec_path,
        default_sender=creator,
    )
    app_client, _ = factory.send.create(AppFactoryCreateParams())
    return app_client


@pytest.fixture
def initialized_app(
    deployed_app: AppClient,
    authority_account: str,
) -> AppClient:
    """
    Deploy and initialize a TitleProofAnchor contract with an anchor authority.

    Returns:
        An AppClient connected to the initialized application.
    """
    deployed_app.send.call(
        method="initialize",
        args={"authority": authority_account},
    )
    return deployed_app


class TestInitialize:
    """Tests for the initialize method."""

    def test_initialize_sets_authority(
        self,
        deployed_app: AppClient,
        authority_account: str,
    ) -> None:
        """Verify that the creator can successfully initialize the anchor authority."""
        result = deployed_app.send.call(
            method="initialize",
            args={"authority": authority_account},
        )
        # The call should succeed without error
        assert result is not None

    def test_initialize_cannot_be_called_twice(
        self,
        initialized_app: AppClient,
        authority_account: str,
    ) -> None:
        """Verify that initialize cannot be called again after the first call."""
        with pytest.raises(LogicError, match="Already initialized"):
            initialized_app.send.call(
                method="initialize",
                args={"authority": authority_account},
            )

    def test_initialize_only_creator(
        self,
        algorand: AlgorandClient,
        app_spec_path: Path,
        creator: str,
        unauthorized_account: str,
        authority_account: str,
    ) -> None:
        """Verify that only the contract creator can call initialize."""
        # Deploy a fresh contract
        factory = AppFactory(
            algorand=algorand,
            app_spec=app_spec_path,
            default_sender=creator,
        )
        app_client, _ = factory.send.create(AppFactoryCreateParams())

        # Try to initialize from a non-creator account
        with pytest.raises(LogicError, match="Only creator can initialize"):
            app_client.send.call(
                method="initialize",
                args={"authority": authority_account},
                sender=unauthorized_account,
            )


class TestAnchorState:
    """Tests for the anchor_state method."""

    def test_anchor_state_success(
        self,
        initialized_app: AppClient,
        authority_account: str,
    ) -> None:
        """Verify that the anchor authority can successfully anchor a state root."""
        result = initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "UP",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 100,
                "fabric_block_end": 200,
                "state_root": b"\xab\xcd\xef" * 10 + b"\x12\x34",
                "tx_count": 42,
            },
            sender=authority_account,
        )
        # The return value should be the anchor sequence number (1 for first anchor)
        assert result.abi_return is not None
        assert result.abi_return == 1

    def test_anchor_state_increments_counter(
        self,
        initialized_app: AppClient,
        authority_account: str,
    ) -> None:
        """Verify that each anchor call increments the anchor counter."""
        # First anchor
        result1 = initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "MH",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 1,
                "fabric_block_end": 50,
                "state_root": b"\x01" * 32,
                "tx_count": 10,
            },
            sender=authority_account,
        )
        assert result1.abi_return == 1

        # Second anchor
        result2 = initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "MH",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 51,
                "fabric_block_end": 100,
                "state_root": b"\x02" * 32,
                "tx_count": 15,
            },
            sender=authority_account,
        )
        assert result2.abi_return == 2

        # Third anchor from a different state
        result3 = initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "DL",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 1,
                "fabric_block_end": 25,
                "state_root": b"\x03" * 32,
                "tx_count": 5,
            },
            sender=authority_account,
        )
        assert result3.abi_return == 3

    def test_unauthorized_anchor(
        self,
        initialized_app: AppClient,
        unauthorized_account: str,
    ) -> None:
        """Verify that a non-authority account cannot submit anchors."""
        with pytest.raises(LogicError, match="Unauthorized"):
            initialized_app.send.call(
                method="anchor_state",
                args={
                    "state_code": "UP",
                    "channel_id": "land-registry-channel",
                    "fabric_block_start": 1,
                    "fabric_block_end": 10,
                    "state_root": b"\xff" * 32,
                    "tx_count": 5,
                },
                sender=unauthorized_account,
            )


class TestRotateAuthority:
    """Tests for the rotate_authority method."""

    def test_rotate_authority_success(
        self,
        algorand: AlgorandClient,
        initialized_app: AppClient,
        authority_account: str,
    ) -> None:
        """Verify that the current authority can rotate to a new authority."""
        # Create a new account to become the new authority
        new_authority = algorand.account.random()
        dispenser = algorand.account.localnet_dispenser()
        algorand.send.payment(
            sender=dispenser.address,
            receiver=new_authority.address,
            amount=10_000_000,
        )

        # Rotate authority
        result = initialized_app.send.call(
            method="rotate_authority",
            args={"new_authority": new_authority.address},
            sender=authority_account,
        )
        assert result is not None

        # Verify the new authority can anchor
        anchor_result = initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "KA",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 1,
                "fabric_block_end": 10,
                "state_root": b"\xaa" * 32,
                "tx_count": 3,
            },
            sender=new_authority.address,
        )
        assert anchor_result.abi_return == 1

        # Verify the old authority can no longer anchor
        with pytest.raises(LogicError, match="Unauthorized"):
            initialized_app.send.call(
                method="anchor_state",
                args={
                    "state_code": "KA",
                    "channel_id": "land-registry-channel",
                    "fabric_block_start": 11,
                    "fabric_block_end": 20,
                    "state_root": b"\xbb" * 32,
                    "tx_count": 7,
                },
                sender=authority_account,
            )

    def test_rotate_authority_unauthorized(
        self,
        initialized_app: AppClient,
        unauthorized_account: str,
    ) -> None:
        """Verify that a non-authority account cannot rotate the authority."""
        with pytest.raises(LogicError, match="Unauthorized"):
            initialized_app.send.call(
                method="rotate_authority",
                args={"new_authority": unauthorized_account},
                sender=unauthorized_account,
            )


class TestGetAnchorCount:
    """Tests for the get_anchor_count readonly method."""

    def test_get_anchor_count_initial(
        self,
        initialized_app: AppClient,
    ) -> None:
        """Verify that the anchor count starts at zero after initialization."""
        result = initialized_app.send.call(
            method="get_anchor_count",
        )
        assert result.abi_return == 0

    def test_get_anchor_count_after_anchoring(
        self,
        initialized_app: AppClient,
        authority_account: str,
    ) -> None:
        """Verify that get_anchor_count returns the correct count after anchoring."""
        # Submit two anchors
        initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "RJ",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 1,
                "fabric_block_end": 50,
                "state_root": b"\xde\xad" * 16,
                "tx_count": 20,
            },
            sender=authority_account,
        )
        initialized_app.send.call(
            method="anchor_state",
            args={
                "state_code": "RJ",
                "channel_id": "land-registry-channel",
                "fabric_block_start": 51,
                "fabric_block_end": 100,
                "state_root": b"\xbe\xef" * 16,
                "tx_count": 30,
            },
            sender=authority_account,
        )

        # Check the count
        result = initialized_app.send.call(
            method="get_anchor_count",
        )
        assert result.abi_return == 2
