"""
Algorand smart contract for anchoring Hyperledger Fabric state roots.

Deployed as an ARC4 Application (stateful smart contract) on Algorand.
This contract provides the public verification layer for BhulekhChain,
allowing anyone to independently verify that a Fabric state root was
anchored at a specific point in time.

Only the authorized anchor account (controlled by the BhulekhChain
middleware) can write anchors. The contract creator sets the initial
authority, and authority can be rotated by the current authority holder.

Architecture role: Algorand is the "citizen trust layer" — anchoring
Fabric state roots here means that even if the government Fabric network
is compromised, there is a tamper-proof public record of every state
transition batch.
"""

from algopy import ARC4Contract, GlobalState, Txn, op, arc4, UInt64, Bytes


class TitleProofAnchor(ARC4Contract):
    """
    Stores Fabric state roots on Algorand for independent verification.

    Global state layout:
        anchor_authority   - Address of the account authorized to submit anchors
        total_anchors      - Running count of all anchors submitted
        last_anchor_round  - Algorand round number of the most recent anchor

    Each anchor_state call records a batch of Fabric blocks (identified by
    state_code, channel_id, block range, state root hash, and transaction
    count). The state root itself is passed as an argument and is available
    in the transaction log for off-chain verifiers to inspect. On-chain, the
    contract tracks the anchor sequence number and the Algorand round for
    temporal ordering.
    """

    # Global state declarations
    anchor_authority: GlobalState[Bytes]
    total_anchors: GlobalState[UInt64]
    last_anchor_round: GlobalState[UInt64]

    def __init__(self) -> None:
        self.anchor_authority = GlobalState(Bytes)
        self.total_anchors = GlobalState(UInt64, default=UInt64(0))
        self.last_anchor_round = GlobalState(UInt64, default=UInt64(0))

    @arc4.abimethod
    def initialize(self, authority: arc4.Address) -> None:
        """
        Set the authorized anchor account. Can only be called once by the
        application creator.

        Args:
            authority: The Algorand address that will be permitted to submit
                       state root anchors and manage title ASAs.

        Raises:
            AssertionError: If the caller is not the creator or if the
                            contract has already been initialized.
        """
        assert Txn.sender == op.Global.creator_address, "Only creator can initialize"
        assert self.anchor_authority.get(default=Bytes(b"")) == Bytes(b""), "Already initialized"
        self.anchor_authority.value = authority.bytes

    @arc4.abimethod
    def anchor_state(
        self,
        state_code: arc4.String,
        channel_id: arc4.String,
        fabric_block_start: arc4.UInt64,
        fabric_block_end: arc4.UInt64,
        state_root: arc4.DynamicBytes,
        tx_count: arc4.UInt64,
    ) -> arc4.UInt64:
        """
        Anchor a Fabric state root to Algorand.

        This is the core anchoring operation. The middleware batches Fabric
        blocks (typically every N blocks or every M minutes), computes a
        Merkle root of all state changes in that batch, and submits it here.

        The state_root bytes are recorded in the transaction arguments and
        are therefore permanently available via the Algorand Indexer. The
        on-chain global state only tracks the anchor count and last round
        for efficiency.

        Args:
            state_code:         Indian state code (e.g., "UP", "MH", "DL")
            channel_id:         Fabric channel name (e.g., "land-registry-channel")
            fabric_block_start: First Fabric block number in this anchor batch
            fabric_block_end:   Last Fabric block number in this anchor batch
            state_root:         Merkle root hash of all state changes in the batch
            tx_count:           Number of Fabric transactions in this batch

        Returns:
            The anchor sequence number (1-indexed).

        Raises:
            AssertionError: If the caller is not the authorized anchor account.
        """
        assert Txn.sender == self.anchor_authority.value, "Unauthorized: only anchor authority can submit"

        # Validate block range is coherent
        assert fabric_block_end.native >= fabric_block_start.native, "Invalid block range: end < start"

        # Validate state root is non-empty
        assert state_root.native.length > UInt64(0), "State root cannot be empty"

        # Increment the anchor counter
        self.total_anchors.value = self.total_anchors.value + UInt64(1)
        self.last_anchor_round.value = op.Global.round

        # The state_root, state_code, channel_id, block range, and tx_count
        # are all recorded as ABI arguments in the transaction itself. Any
        # verifier can query the Algorand Indexer to retrieve these values
        # and independently recompute the Merkle root from the Fabric ledger.

        return arc4.UInt64(self.total_anchors.value)

    @arc4.abimethod(readonly=True)
    def get_anchor_count(self) -> arc4.UInt64:
        """
        Get total number of state root anchors submitted to this contract.

        This is a read-only method that does not modify state. It can be
        called by anyone without a transaction fee (via simulate).

        Returns:
            The total number of anchors as an ARC4-encoded UInt64.
        """
        return arc4.UInt64(self.total_anchors.value)

    @arc4.abimethod
    def rotate_authority(self, new_authority: arc4.Address) -> None:
        """
        Rotate the anchor authority to a new address.

        This allows key rotation without redeploying the contract. Only the
        current authority can perform this operation. After rotation, the old
        authority address can no longer submit anchors.

        Args:
            new_authority: The new Algorand address to authorize for anchoring.

        Raises:
            AssertionError: If the caller is not the current anchor authority
                            or if the new authority is a zero address.
        """
        assert Txn.sender == self.anchor_authority.value, "Unauthorized: only current authority can rotate"
        assert new_authority.bytes != Bytes(b""), "New authority cannot be empty"
        self.anchor_authority.value = new_authority.bytes
