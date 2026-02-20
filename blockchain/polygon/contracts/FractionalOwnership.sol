// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BhulekhChain Fractional Ownership
 * @notice ERC-1155 contract for fractional property ownership on Polygon.
 *         Allows government-approved properties to be split into fractions,
 *         enabling partial ownership and rental income distribution.
 * @dev Each fractionalized property gets a unique ERC-1155 token ID.
 *      Multiple holders can own fractions of the same property.
 *      Rental income is deposited by the government and claimable
 *      proportionally by fraction holders.
 *
 *      Integration with TitleDeedNFT:
 *      - A property must first be tokenized as an ERC-721 in TitleDeedNFT
 *      - The ERC-721 must have fractionalization enabled
 *      - Then this contract can create ERC-1155 fractions
 */
contract FractionalOwnership is ERC1155, AccessControl, ReentrancyGuard {
    /// @notice Role for government administrators
    bytes32 public constant GOVT_ADMIN_ROLE = keccak256("GOVT_ADMIN_ROLE");

    /**
     * @notice Data for a fractionalized property
     * @dev totalFractions represents 100% ownership (e.g., 10000 = 100.00%)
     */
    struct FractionalProperty {
        uint256 titleDeedTokenId;   // Reference to TitleDeedNFT token ID
        uint256 totalFractions;     // Total fractions (e.g., 10000 = 100%)
        uint256 pricePerFraction;   // Price per fraction in wei (MATIC)
        uint256 minFractions;       // Minimum purchase amount (e.g., 100 = 1%)
        bool active;                // Whether fractions are available for purchase
        uint256 totalRentalPool;    // Accumulated rental income in wei
        uint256 lastDistribution;   // Timestamp of last rental deposit
    }

    /// @notice Property ID => FractionalProperty data
    mapping(uint256 => FractionalProperty) public properties;

    /// @notice Property ID => holder address => amount of rental already claimed
    mapping(uint256 => mapping(address => uint256)) public rentalClaimed;

    /// @notice Address of the TitleDeedNFT contract
    address public titleDeedContract;

    /// @dev Auto-incrementing property ID counter
    uint256 private _nextPropertyId;

    // ========== Events ==========

    /// @notice Emitted when a property is fractionalized
    event Fractionalized(
        uint256 indexed propertyId,
        uint256 titleDeedTokenId,
        uint256 totalFractions,
        uint256 pricePerFraction
    );

    /// @notice Emitted when fractions are purchased
    event FractionsPurchased(
        uint256 indexed propertyId,
        address indexed buyer,
        uint256 amount,
        uint256 totalPaid
    );

    /// @notice Emitted when rental income is deposited
    event RentalDeposited(
        uint256 indexed propertyId,
        uint256 amount,
        uint256 newTotal
    );

    /// @notice Emitted when a fraction holder claims rental income
    event RentalClaimed(
        uint256 indexed propertyId,
        address indexed holder,
        uint256 amount
    );

    // ========== Errors ==========

    /// @notice Thrown when a property is not active for purchases
    error PropertyNotActive(uint256 propertyId);

    /// @notice Thrown when purchase amount is below minimum
    error BelowMinimumFractions(uint256 requested, uint256 minimum);

    /// @notice Thrown when payment is insufficient
    error InsufficientPayment(uint256 sent, uint256 required);

    /// @notice Thrown when a holder has no fractions
    error NoFractionsHeld(uint256 propertyId, address holder);

    /// @notice Thrown when there is nothing to claim
    error NothingToClaim(uint256 propertyId, address holder);

    /// @notice Thrown when a native transfer fails
    error TransferFailed(address recipient, uint256 amount);

    /**
     * @notice Deploy the FractionalOwnership contract
     * @param _titleDeedContract Address of the TitleDeedNFT proxy
     * @param govAdmin Address of the government admin multisig
     */
    constructor(
        address _titleDeedContract,
        address govAdmin
    ) ERC1155("") {
        titleDeedContract = _titleDeedContract;
        _grantRole(DEFAULT_ADMIN_ROLE, govAdmin);
        _grantRole(GOVT_ADMIN_ROLE, govAdmin);
        _nextPropertyId = 1;
    }

    /**
     * @notice Fractionalize a tokenized property into ERC-1155 shares
     * @dev Only callable by GOVT_ADMIN_ROLE. All fractions are initially
     *      minted to this contract and held for sale.
     * @param titleDeedTokenId The TitleDeedNFT token ID to fractionalize
     * @param totalFractions Total number of fractions (e.g., 10000)
     * @param pricePerFraction Price per fraction in wei
     * @param minFractions Minimum number of fractions per purchase
     * @return propertyId The newly created fractional property ID
     */
    function fractionalize(
        uint256 titleDeedTokenId,
        uint256 totalFractions,
        uint256 pricePerFraction,
        uint256 minFractions
    ) external onlyRole(GOVT_ADMIN_ROLE) returns (uint256) {
        require(totalFractions > 0, "Total fractions must be > 0");
        require(pricePerFraction > 0, "Price must be > 0");
        require(minFractions > 0 && minFractions <= totalFractions, "Invalid min fractions");

        uint256 propertyId = _nextPropertyId++;

        properties[propertyId] = FractionalProperty({
            titleDeedTokenId: titleDeedTokenId,
            totalFractions: totalFractions,
            pricePerFraction: pricePerFraction,
            minFractions: minFractions,
            active: true,
            totalRentalPool: 0,
            lastDistribution: block.timestamp
        });

        // Mint all fractions to this contract (held for sale)
        _mint(address(this), propertyId, totalFractions, "");

        emit Fractionalized(propertyId, titleDeedTokenId, totalFractions, pricePerFraction);
        return propertyId;
    }

    /**
     * @notice Purchase fractions of a property
     * @dev Caller must send sufficient MATIC. The fractions are transferred
     *      from this contract to the buyer.
     * @param propertyId The fractional property ID
     * @param amount Number of fractions to purchase
     */
    function purchaseFractions(
        uint256 propertyId,
        uint256 amount
    ) external payable nonReentrant {
        FractionalProperty storage prop = properties[propertyId];

        if (!prop.active) {
            revert PropertyNotActive(propertyId);
        }
        if (amount < prop.minFractions) {
            revert BelowMinimumFractions(amount, prop.minFractions);
        }

        uint256 totalCost = amount * prop.pricePerFraction;
        if (msg.value < totalCost) {
            revert InsufficientPayment(msg.value, totalCost);
        }

        // Transfer fractions from contract to buyer
        _safeTransferFrom(address(this), msg.sender, propertyId, amount, "");

        // Refund excess payment
        if (msg.value > totalCost) {
            (bool refunded, ) = payable(msg.sender).call{
                value: msg.value - totalCost
            }("");
            if (!refunded) {
                revert TransferFailed(msg.sender, msg.value - totalCost);
            }
        }

        emit FractionsPurchased(propertyId, msg.sender, amount, totalCost);
    }

    /**
     * @notice Deposit rental income for a fractionalized property
     * @dev Only callable by GOVT_ADMIN_ROLE. The deposited MATIC is
     *      distributed proportionally to fraction holders when they claim.
     * @param propertyId The fractional property ID
     */
    function depositRental(
        uint256 propertyId
    ) external payable onlyRole(GOVT_ADMIN_ROLE) {
        require(msg.value > 0, "Must deposit > 0");
        require(properties[propertyId].active, "Property not active");

        properties[propertyId].totalRentalPool += msg.value;
        properties[propertyId].lastDistribution = block.timestamp;

        emit RentalDeposited(propertyId, msg.value, properties[propertyId].totalRentalPool);
    }

    /**
     * @notice Claim accumulated rental income for a property
     * @dev Calculates the caller's share based on their fraction balance
     *      relative to total fractions, minus any previously claimed amount.
     *      Uses ReentrancyGuard to prevent reentrancy attacks.
     * @param propertyId The fractional property ID
     */
    function claimRental(uint256 propertyId) external nonReentrant {
        uint256 holderBalance = balanceOf(msg.sender, propertyId);
        if (holderBalance == 0) {
            revert NoFractionsHeld(propertyId, msg.sender);
        }

        FractionalProperty storage prop = properties[propertyId];

        // Calculate total entitled share based on current balance
        uint256 totalShare = (prop.totalRentalPool * holderBalance) /
            prop.totalFractions;
        uint256 claimed = rentalClaimed[propertyId][msg.sender];
        uint256 claimable = totalShare - claimed;

        if (claimable == 0) {
            revert NothingToClaim(propertyId, msg.sender);
        }

        // Update claimed amount before transfer (checks-effects-interactions)
        rentalClaimed[propertyId][msg.sender] = totalShare;

        (bool sent, ) = payable(msg.sender).call{value: claimable}("");
        if (!sent) {
            revert TransferFailed(msg.sender, claimable);
        }

        emit RentalClaimed(propertyId, msg.sender, claimable);
    }

    /**
     * @notice ERC-165 interface support
     * @dev Resolves diamond inheritance between ERC1155 and AccessControl
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Required override to allow this contract to receive ERC-1155 tokens
     * @dev Needed because the contract mints fractions to itself
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    /**
     * @notice Required override for batch ERC-1155 receives
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
