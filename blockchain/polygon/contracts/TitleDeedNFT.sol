// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title BhulekhChain Title Deed NFT
 * @notice ERC-721 representing tokenized property title deeds on Polygon.
 *         Part of the three-chain BhulekhChain architecture:
 *         - Hyperledger Fabric: core government registry
 *         - Algorand: public verification & state proofs
 *         - Polygon (this contract): tokenization & fractional ownership
 * @dev Only government admin (multisig) can mint. Transfers require explicit
 *      government approval to ensure on-chain tokenization reflects off-chain
 *      legal transfers registered on Fabric.
 *      UUPS-upgradeable to allow contract evolution without redeployment.
 */
contract TitleDeedNFT is
    ERC721Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    /// @notice Role for government administrators (registrars, revenue dept)
    bytes32 public constant GOVT_ADMIN_ROLE = keccak256("GOVT_ADMIN_ROLE");

    /// @notice Role for proxy upgrade authorization
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /**
     * @notice On-chain representation of a property title deed
     * @dev Links back to Fabric (fabricTxHash) and Algorand (algorandAsaId)
     *      for three-chain verification. No PII is stored on-chain -- only
     *      the SHA-256 hash of the owner's Aadhaar number.
     */
    struct TitleDeed {
        string propertyId;          // BhulekhChain property ID (e.g., "MP-IND-001-0042")
        string fabricTxHash;        // Hyperledger Fabric transaction hash
        uint256 algorandAsaId;      // Algorand Standard Asset ID for verification
        string documentCID;         // IPFS CID of the registered sale deed
        string ownerAadhaarHash;    // SHA-256 hash of owner's Aadhaar (no PII on-chain)
        uint256 areaSqMeters;       // Plot area in square meters
        string stateCode;           // Indian state code (e.g., "MP", "UP", "MH")
        uint256 registrationDate;   // Unix timestamp of registration
        bool fractionalizable;      // Whether the property can be fractionalized
        bool transferApproved;      // Government approval flag for pending transfer
    }

    /// @notice Token ID => TitleDeed data
    mapping(uint256 => TitleDeed) public titleDeeds;

    /// @notice Property ID string => Token ID (ensures one NFT per property)
    mapping(string => uint256) public propertyIdToTokenId;

    /// @notice Token ID => approved new owner address (for transfer workflow)
    mapping(uint256 => address) public approvedTransferRecipient;

    /// @dev Auto-incrementing token ID counter, starts at 1
    uint256 private _nextTokenId;

    // ========== Events ==========

    /// @notice Emitted when a new title deed NFT is minted
    event TitleMinted(
        uint256 indexed tokenId,
        string propertyId,
        string ownerAadhaarHash,
        address indexed owner
    );

    /// @notice Emitted when a government admin approves a transfer
    event TransferApproved(
        uint256 indexed tokenId,
        address indexed newOwner
    );

    /// @notice Emitted when fractionalization is enabled for a property
    event FractionalizationEnabled(uint256 indexed tokenId);

    // ========== Errors ==========

    /// @notice Thrown when trying to tokenize a property that already has an NFT
    error PropertyAlreadyTokenized(string propertyId);

    /// @notice Thrown when a transfer has not been approved by government
    error GovernmentApprovalRequired(uint256 tokenId);

    /// @notice Thrown when the transfer recipient does not match the approved address
    error TransferRecipientMismatch(uint256 tokenId, address expected, address actual);

    /// @notice Thrown when querying a token that does not exist
    error TokenDoesNotExist(uint256 tokenId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (called once via proxy)
     * @param govAdmin Address of the government admin multisig
     */
    function initialize(address govAdmin) public initializer {
        __ERC721_init("BhulekhChain Title Deed", "BKTITLE");
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, govAdmin);
        _grantRole(GOVT_ADMIN_ROLE, govAdmin);
        _grantRole(UPGRADER_ROLE, govAdmin);

        _nextTokenId = 1;
    }

    /**
     * @notice Mint a new title deed NFT for a registered property
     * @dev Only callable by GOVT_ADMIN_ROLE. Each propertyId can only be tokenized once.
     *      The mint links the on-chain NFT to the Fabric ledger record and Algorand ASA.
     * @param owner Address that will own the NFT
     * @param propertyId BhulekhChain property identifier
     * @param fabricTxHash Hyperledger Fabric transaction hash of the registration
     * @param algorandAsaId Algorand ASA ID for public verification
     * @param documentCID IPFS content identifier for the sale deed document
     * @param ownerAadhaarHash SHA-256 hash of the owner's Aadhaar number
     * @param areaSqMeters Plot area in square meters
     * @param stateCode Indian state code
     * @return tokenId The newly minted token ID
     */
    function mintTitle(
        address owner,
        string calldata propertyId,
        string calldata fabricTxHash,
        uint256 algorandAsaId,
        string calldata documentCID,
        string calldata ownerAadhaarHash,
        uint256 areaSqMeters,
        string calldata stateCode
    ) external onlyRole(GOVT_ADMIN_ROLE) whenNotPaused returns (uint256) {
        if (propertyIdToTokenId[propertyId] != 0) {
            revert PropertyAlreadyTokenized(propertyId);
        }

        uint256 tokenId = _nextTokenId++;
        _safeMint(owner, tokenId);

        titleDeeds[tokenId] = TitleDeed({
            propertyId: propertyId,
            fabricTxHash: fabricTxHash,
            algorandAsaId: algorandAsaId,
            documentCID: documentCID,
            ownerAadhaarHash: ownerAadhaarHash,
            areaSqMeters: areaSqMeters,
            stateCode: stateCode,
            registrationDate: block.timestamp,
            fractionalizable: false,
            transferApproved: false
        });

        propertyIdToTokenId[propertyId] = tokenId;

        emit TitleMinted(tokenId, propertyId, ownerAadhaarHash, owner);
        return tokenId;
    }

    /**
     * @notice Government must approve a transfer before it can execute
     * @dev This ensures on-chain tokenization reflects the off-chain legal transfer
     *      that has been registered on the Fabric ledger.
     * @param tokenId The token ID of the title deed
     * @param newOwner The address approved to receive the NFT
     */
    function approveTransfer(
        uint256 tokenId,
        address newOwner
    ) external onlyRole(GOVT_ADMIN_ROLE) {
        if (_ownerOf(tokenId) == address(0)) {
            revert TokenDoesNotExist(tokenId);
        }
        titleDeeds[tokenId].transferApproved = true;
        approvedTransferRecipient[tokenId] = newOwner;
        emit TransferApproved(tokenId, newOwner);
    }

    /**
     * @notice Override ERC-721 _update to enforce government approval on transfers
     * @dev Minting (from == address(0)) is always allowed.
     *      Burning (to == address(0)) is always allowed.
     *      All other transfers require transferApproved == true and the recipient
     *      must match the approved address.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from is zero) and burning (to is zero)
        if (from != address(0) && to != address(0)) {
            if (!titleDeeds[tokenId].transferApproved) {
                revert GovernmentApprovalRequired(tokenId);
            }

            address expectedRecipient = approvedTransferRecipient[tokenId];
            if (expectedRecipient != address(0) && to != expectedRecipient) {
                revert TransferRecipientMismatch(tokenId, expectedRecipient, to);
            }

            // Reset approval after transfer executes
            titleDeeds[tokenId].transferApproved = false;
            approvedTransferRecipient[tokenId] = address(0);
        }

        return super._update(to, tokenId, auth);
    }

    /**
     * @notice Enable fractionalization for a property
     * @dev Once enabled, the FractionalOwnership contract can create ERC-1155
     *      fractions for this title deed.
     * @param tokenId The token ID to enable fractionalization for
     */
    function enableFractionalization(
        uint256 tokenId
    ) external onlyRole(GOVT_ADMIN_ROLE) {
        if (_ownerOf(tokenId) == address(0)) {
            revert TokenDoesNotExist(tokenId);
        }
        titleDeeds[tokenId].fractionalizable = true;
        emit FractionalizationEnabled(tokenId);
    }

    /**
     * @notice Get three-chain verification data for a title deed
     * @dev Returns the cross-chain references needed to verify a property
     *      across Fabric, Algorand, and Polygon.
     * @param tokenId The token ID to query
     * @return propertyId The BhulekhChain property ID
     * @return fabricTxHash The Fabric transaction hash
     * @return algorandAsaId The Algorand ASA ID
     * @return documentCID The IPFS document CID
     */
    function getVerification(
        uint256 tokenId
    )
        external
        view
        returns (
            string memory propertyId,
            string memory fabricTxHash,
            uint256 algorandAsaId,
            string memory documentCID
        )
    {
        if (_ownerOf(tokenId) == address(0)) {
            revert TokenDoesNotExist(tokenId);
        }
        TitleDeed storage deed = titleDeeds[tokenId];
        return (
            deed.propertyId,
            deed.fabricTxHash,
            deed.algorandAsaId,
            deed.documentCID
        );
    }

    /**
     * @notice Pause all minting and transfers (emergency)
     * @dev Only callable by GOVT_ADMIN_ROLE
     */
    function pause() external onlyRole(GOVT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only callable by GOVT_ADMIN_ROLE
     */
    function unpause() external onlyRole(GOVT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Authorize proxy upgrades (UUPS pattern)
     * @dev Only callable by UPGRADER_ROLE
     */
    function _authorizeUpgrade(
        address /* newImplementation */
    ) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice ERC-165 interface support
     * @dev Resolves diamond inheritance between ERC721Upgradeable and AccessControlUpgradeable
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
