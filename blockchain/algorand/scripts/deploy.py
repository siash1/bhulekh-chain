"""
Deployment script for the TitleProofAnchor Algorand smart contract.

Usage:
    python scripts/deploy.py --network localnet
    python scripts/deploy.py --network testnet
    python scripts/deploy.py --network mainnet

This script:
    1. Connects to the specified Algorand network
    2. Compiles the TitleProofAnchor ARC4 contract
    3. Deploys it as a new application
    4. Initializes the contract with the deployer as the anchor authority
    5. Prints the deployed application ID

Prerequisites:
    - For localnet: `algokit localnet start` must be running
    - For testnet/mainnet: ALGORAND_ALGOD_URL and ALGORAND_ANCHOR_ACCOUNT_MNEMONIC
      environment variables must be set
    - algokit CLI must be installed for contract compilation
"""

import argparse
import os
import sys
from pathlib import Path

from algokit_utils import (
    AlgorandClient,
    AppFactory,
)
from algokit_utils.applications.app_factory import AppFactoryParams, AppFactoryCreateParams


# Network configuration presets
NETWORK_CONFIG: dict[str, dict[str, str]] = {
    "localnet": {
        "algod_url": "http://localhost:4001",
        "algod_token": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "indexer_url": "http://localhost:8980",
    },
    "testnet": {
        "algod_url": os.getenv("ALGORAND_ALGOD_URL", "https://testnet-api.algonode.cloud"),
        "algod_token": "",
        "indexer_url": os.getenv("ALGORAND_INDEXER_URL", "https://testnet-idx.algonode.cloud"),
    },
    "mainnet": {
        "algod_url": os.getenv("ALGORAND_ALGOD_URL", "https://mainnet-api.algonode.cloud"),
        "algod_token": "",
        "indexer_url": os.getenv("ALGORAND_INDEXER_URL", "https://mainnet-idx.algonode.cloud"),
    },
}


def get_app_spec_path() -> Path:
    """
    Locate the compiled ARC-32/ARC-56 application specification JSON.

    The contract must be compiled before deployment using:
        algokit compile py contracts/title_proof.py

    Returns:
        Path to the application specification JSON file.

    Raises:
        FileNotFoundError: If the compiled spec is not found.
    """
    project_root = Path(__file__).parent.parent
    # algokit compile outputs to artifacts/ by default
    candidates = [
        project_root / "artifacts" / "TitleProofAnchor" / "application.json",
        project_root / "artifacts" / "title_proof" / "TitleProofAnchor.arc32.json",
        project_root / "artifacts" / "TitleProofAnchor.arc32.json",
        project_root / "artifacts" / "TitleProofAnchor" / "TitleProofAnchor.arc56.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        f"Compiled application spec not found. Searched:\n"
        + "\n".join(f"  - {c}" for c in candidates)
        + "\n\nRun 'algokit compile py contracts/title_proof.py' first."
    )


def deploy(network: str) -> int:
    """
    Deploy the TitleProofAnchor contract to the specified network.

    Args:
        network: One of "localnet", "testnet", or "mainnet".

    Returns:
        The deployed application ID.
    """
    if network not in NETWORK_CONFIG:
        print(f"Error: Unknown network '{network}'. Use localnet, testnet, or mainnet.")
        sys.exit(1)

    config = NETWORK_CONFIG[network]
    print(f"Deploying TitleProofAnchor to {network}...")
    print(f"  Algod URL: {config['algod_url']}")

    # Initialize Algorand client
    if network == "localnet":
        algorand = AlgorandClient.default_localnet()
    elif network == "testnet":
        algorand = AlgorandClient.testnet()
    else:
        algorand = AlgorandClient.mainnet()

    # Get the deployer/anchor account
    if network == "localnet":
        # Use the default localnet dispenser account for local development
        deployer = algorand.account.localnet_dispenser()
        print(f"  Deployer (localnet dispenser): {deployer.address}")
    else:
        # For testnet/mainnet, require the mnemonic environment variable
        mnemonic = os.getenv("ALGORAND_ANCHOR_ACCOUNT_MNEMONIC")
        if not mnemonic:
            print("Error: ALGORAND_ANCHOR_ACCOUNT_MNEMONIC environment variable not set.")
            print("Set it to the 25-word mnemonic of the anchor/deployer account.")
            sys.exit(1)
        deployer = algorand.account.from_mnemonic(mnemonic=mnemonic)
        print(f"  Deployer: {deployer.address}")

    # Locate the compiled application specification
    app_spec_path = get_app_spec_path()
    print(f"  App spec: {app_spec_path}")

    # Load the app spec JSON content (string is treated as JSON, not a path)
    app_spec_json = app_spec_path.read_text()

    # Create an AppFactory for the TitleProofAnchor contract
    factory = AppFactory(
        AppFactoryParams(
            algorand=algorand,
            app_spec=app_spec_json,
            default_sender=deployer.address,
        )
    )

    # Deploy the application (bare create — no ABI method on creation)
    print("  Creating application on-chain...")
    app_client, create_result = factory.send.bare.create(
        AppFactoryCreateParams()
    )

    app_id = app_client.app_id
    app_address = app_client.app_address
    print(f"  Application created successfully!")
    print(f"  App ID:      {app_id}")
    print(f"  App Address: {app_address}")
    print(f"  Create TxID: {create_result.tx_id}")

    # Initialize the contract with the deployer as the anchor authority.
    # In production, this would be a dedicated anchor service account,
    # but for initial deployment the deployer sets itself as authority
    # and can later rotate to a different account.
    print(f"  Initializing with anchor authority: {deployer.address}")
    from algokit_utils.applications.app_client import AppClientMethodCallParams
    app_client.send.call(AppClientMethodCallParams(
        method="initialize",
        args=[deployer.address],
    ))
    print("  Contract initialized successfully!")

    # Print summary
    print("\n" + "=" * 60)
    print("  DEPLOYMENT COMPLETE")
    print("=" * 60)
    print(f"  Network:          {network}")
    print(f"  App ID:           {app_id}")
    print(f"  App Address:      {app_address}")
    print(f"  Anchor Authority: {deployer.address}")
    print(f"\n  Set this in your .env file:")
    print(f"  ALGORAND_APP_ID={app_id}")
    print("=" * 60)

    return app_id


def main() -> None:
    """Entry point for the deployment script."""
    parser = argparse.ArgumentParser(
        description="Deploy the BhulekhChain TitleProofAnchor contract to Algorand.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python scripts/deploy.py --network localnet\n"
            "  python scripts/deploy.py --network testnet\n"
            "\n"
            "Environment variables (required for testnet/mainnet):\n"
            "  ALGORAND_ANCHOR_ACCOUNT_MNEMONIC  25-word mnemonic for deployer account\n"
            "  ALGORAND_ALGOD_URL                Algod API endpoint (optional, has defaults)\n"
            "  ALGORAND_INDEXER_URL              Indexer API endpoint (optional, has defaults)\n"
        ),
    )
    parser.add_argument(
        "--network",
        type=str,
        choices=["localnet", "testnet", "mainnet"],
        default="localnet",
        help="Target Algorand network (default: localnet)",
    )

    args = parser.parse_args()
    deploy(args.network)


if __name__ == "__main__":
    main()
