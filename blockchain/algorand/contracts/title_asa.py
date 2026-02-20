"""
Helper functions for creating and managing Algorand Standard Assets (ASAs)
representing land title certificates in BhulekhChain.

These are NOT smart contracts -- ASAs are native Algorand primitives.
The functions here use algokit_utils to interact with the Algorand network
for ASA creation and metadata-based ownership tracking.

Architecture notes:
    - Each registered property gets a unique ASA (total supply = 1, like an NFT)
    - The anchor_account holds all ASAs on behalf of citizens
    - Citizens do NOT need Algorand wallets; ownership is tracked via metadata
    - ASA note field contains JSON metadata following the "bhulekhchain-v1" standard
    - The anchor_account has manager/reserve/freeze/clawback roles on every ASA
    - Freeze is used when a property is disputed or under court order
    - Ownership transfers are recorded as 0-amount self-transfers with updated notes

Verification flow:
    1. Citizen visits verify.bhulekhchain.gov.in/{property_id}
    2. Backend looks up ASA ID from property_id
    3. Backend queries Algorand Indexer for ASA creation tx + all transfer txs
    4. Frontend displays full ownership history from ASA transaction notes
    5. Citizen can independently verify via any Algorand block explorer
"""

import json
from typing import Any

from algokit_utils import AlgorandClient, AssetCreateParams, AssetTransferParams


def create_title_certificate_asa(
    algorand: AlgorandClient,
    anchor_account: str,
    property_id: str,
    owner_hash: str,
    fabric_tx_id: str,
    document_hash: str,
) -> int:
    """
    Create an ASA representing a title certificate for a registered property.

    The ASA is configured as a unique, non-divisible asset (NFT-like):
        - Total supply: 1
        - Decimals: 0
        - Manager: anchor_account (can update metadata references)
        - Reserve: anchor_account (holds the asset)
        - Freeze: anchor_account (can freeze if property is disputed)
        - Clawback: anchor_account (can reclaim on ownership change)
        - Default frozen: False

    The ASA note field contains a JSON object with the "bhulekhchain-v1"
    metadata standard, linking the ASA to the Fabric transaction and IPFS
    document hash for three-chain verification.

    Args:
        algorand:      An initialized AlgorandClient instance.
        anchor_account: The Algorand address of the BhulekhChain anchor
                        account that manages all title ASAs.
        property_id:   The unique BhulekhChain property identifier
                        (e.g., "UP-LKO-001-00123").
        owner_hash:    SHA-256 hash of the owner's Aadhaar number. PII is
                        never stored on public chains -- only hashed identifiers.
        fabric_tx_id:  The Hyperledger Fabric transaction ID that registered
                        or transferred this property.
        document_hash: IPFS CID or SHA-256 hash of the sale deed / registration
                        document stored on IPFS.

    Returns:
        The ASA ID (int) of the newly created title certificate asset.

    Raises:
        Exception: If the Algorand transaction fails (insufficient balance,
                   network error, etc.).
    """
    note: dict[str, Any] = {
        "standard": "bhulekhchain-v1",
        "property_id": property_id,
        "owner_hash": owner_hash,
        "fabric_tx_id": fabric_tx_id,
        "document_hash": document_hash,
        "type": "TITLE_CERTIFICATE",
    }

    # Asset name is truncated to 32 bytes (Algorand limit)
    # Unit name is truncated to 8 bytes (Algorand limit)
    asset_name = f"TITLE-{property_id[:20]}"
    unit_name = "BKTITLE"
    url = f"https://verify.bhulekhchain.gov.in/{property_id}"

    result = algorand.send.asset_create(
        AssetCreateParams(
            sender=anchor_account,
            total=1,
            decimals=0,
            asset_name=asset_name,
            unit_name=unit_name,
            url=url,
            note=json.dumps(note, separators=(",", ":")).encode("utf-8"),
            manager=anchor_account,
            reserve=anchor_account,
            freeze=anchor_account,
            clawback=anchor_account,
            default_frozen=False,
        )
    )

    asset_id: int = result.confirmation["asset-index"]
    return asset_id


def transfer_title_asa(
    algorand: AlgorandClient,
    anchor_account: str,
    asa_id: int,
    old_owner: str,
    new_owner: str,
    transfer_fabric_tx_id: str,
) -> str:
    """
    Record a title ownership transfer on Algorand.

    Since citizens do not hold Algorand wallets, the anchor_account holds
    all title ASAs on their behalf. Ownership changes are recorded as
    0-amount self-transfers (anchor_account to itself) with an updated
    note field containing the new owner's hashed identifier and the
    corresponding Fabric transaction ID.

    This creates an immutable on-chain trail of ownership changes that
    anyone can verify via the Algorand Indexer by querying all transactions
    for the given ASA ID and reading the note fields chronologically.

    Args:
        algorand:              An initialized AlgorandClient instance.
        anchor_account:        The Algorand address of the BhulekhChain
                                anchor account.
        asa_id:                The ASA ID of the title certificate to transfer.
        old_owner:             SHA-256 hash of the previous owner's Aadhaar.
                                Recorded in the note for audit trail purposes.
        new_owner:             SHA-256 hash of the new owner's Aadhaar.
        transfer_fabric_tx_id: The Hyperledger Fabric transaction ID for the
                                ownership transfer that was executed on the
                                core ledger.

    Returns:
        The Algorand transaction ID (str) of the transfer record.

    Raises:
        Exception: If the Algorand transaction fails.
    """
    note: dict[str, Any] = {
        "standard": "bhulekhchain-v1",
        "action": "OWNERSHIP_TRANSFER",
        "asa_id": asa_id,
        "previous_owner_hash": old_owner,
        "new_owner_hash": new_owner,
        "fabric_tx_id": transfer_fabric_tx_id,
    }

    # Send a 0-amount ASA transfer from anchor_account to itself.
    # The actual ownership semantics are encoded in the note field.
    # This creates a permanent, publicly verifiable record of the transfer.
    result = algorand.send.asset_transfer(
        AssetTransferParams(
            sender=anchor_account,
            receiver=anchor_account,
            asset_id=asa_id,
            amount=0,
            note=json.dumps(note, separators=(",", ":")).encode("utf-8"),
        )
    )

    tx_id: str = result.tx_id
    return tx_id
