import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { TitleDeedNFT, FractionalOwnership } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("FractionalOwnership", function () {
  let titleDeed: TitleDeedNFT;
  let fractional: FractionalOwnership;
  let govAdmin: HardhatEthersSigner;
  let buyer1: HardhatEthersSigner;
  let buyer2: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;

  // Fractionalization parameters
  const TOTAL_FRACTIONS = 10000; // 100%
  const PRICE_PER_FRACTION = ethers.parseEther("0.01"); // 0.01 MATIC per fraction
  const MIN_FRACTIONS = 100; // 1% minimum purchase

  // Title deed test data
  const PROPERTY_ID = "MH-MUM-012-0099";
  const FABRIC_TX_HASH =
    "fab_tx_e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const ALGORAND_ASA_ID = 987654321;
  const DOCUMENT_CID = "QmZwAPJzv5CZsnBzt8auVZRnGNMFY9oNafi1FdP7BkiJzz";
  const OWNER_AADHAAR_HASH =
    "c4ca4238a0b923820dcc509a6f75849bc81e728d9d4c2f636f067f89cc14862c";
  const AREA_SQ_METERS = 1200;
  const STATE_CODE = "MH";

  beforeEach(async function () {
    [govAdmin, buyer1, buyer2, unauthorized] = await ethers.getSigners();

    // Deploy TitleDeedNFT (required dependency)
    const TitleDeedNFT = await ethers.getContractFactory("TitleDeedNFT");
    titleDeed = (await upgrades.deployProxy(
      TitleDeedNFT,
      [govAdmin.address],
      {
        initializer: "initialize",
        kind: "uups",
      }
    )) as unknown as TitleDeedNFT;
    await titleDeed.waitForDeployment();

    // Deploy FractionalOwnership
    const FractionalOwnership =
      await ethers.getContractFactory("FractionalOwnership");
    fractional = (await FractionalOwnership.deploy(
      await titleDeed.getAddress(),
      govAdmin.address
    )) as unknown as FractionalOwnership;
    await fractional.waitForDeployment();

    // Mint a title deed and enable fractionalization for test setup
    await titleDeed.mintTitle(
      govAdmin.address,
      PROPERTY_ID,
      FABRIC_TX_HASH,
      ALGORAND_ASA_ID,
      DOCUMENT_CID,
      OWNER_AADHAAR_HASH,
      AREA_SQ_METERS,
      STATE_CODE
    );
    await titleDeed.enableFractionalization(1);
  });

  describe("Fractionalization", function () {
    it("should fractionalize a property", async function () {
      const tx = await fractional.fractionalize(
        1, // titleDeedTokenId
        TOTAL_FRACTIONS,
        PRICE_PER_FRACTION,
        MIN_FRACTIONS
      );

      await tx.wait();

      // Verify property data
      const prop = await fractional.properties(1);
      expect(prop.titleDeedTokenId).to.equal(1);
      expect(prop.totalFractions).to.equal(TOTAL_FRACTIONS);
      expect(prop.pricePerFraction).to.equal(PRICE_PER_FRACTION);
      expect(prop.minFractions).to.equal(MIN_FRACTIONS);
      expect(prop.active).to.be.true;
      expect(prop.totalRentalPool).to.equal(0);

      // Verify all fractions are held by the contract
      const contractBalance = await fractional.balanceOf(
        await fractional.getAddress(),
        1
      );
      expect(contractBalance).to.equal(TOTAL_FRACTIONS);
    });

    it("should emit Fractionalized event", async function () {
      await expect(
        fractional.fractionalize(
          1,
          TOTAL_FRACTIONS,
          PRICE_PER_FRACTION,
          MIN_FRACTIONS
        )
      )
        .to.emit(fractional, "Fractionalized")
        .withArgs(1, 1, TOTAL_FRACTIONS, PRICE_PER_FRACTION);
    });

    it("should reject fractionalization from non-admin", async function () {
      await expect(
        fractional
          .connect(unauthorized)
          .fractionalize(1, TOTAL_FRACTIONS, PRICE_PER_FRACTION, MIN_FRACTIONS)
      ).to.be.reverted;
    });

    it("should auto-increment property IDs", async function () {
      await fractional.fractionalize(
        1,
        TOTAL_FRACTIONS,
        PRICE_PER_FRACTION,
        MIN_FRACTIONS
      );

      // Mint a second title deed
      await titleDeed.mintTitle(
        govAdmin.address,
        "MH-MUM-012-0100",
        FABRIC_TX_HASH,
        999,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        800,
        STATE_CODE
      );
      await titleDeed.enableFractionalization(2);

      await fractional.fractionalize(
        2,
        5000,
        ethers.parseEther("0.02"),
        50
      );

      const prop1 = await fractional.properties(1);
      const prop2 = await fractional.properties(2);
      expect(prop1.titleDeedTokenId).to.equal(1);
      expect(prop2.titleDeedTokenId).to.equal(2);
    });
  });

  describe("Purchasing Fractions", function () {
    beforeEach(async function () {
      await fractional.fractionalize(
        1,
        TOTAL_FRACTIONS,
        PRICE_PER_FRACTION,
        MIN_FRACTIONS
      );
    });

    it("should allow purchasing fractions with correct payment", async function () {
      const amount = 500; // 5%
      const totalCost = PRICE_PER_FRACTION * BigInt(amount);

      await fractional
        .connect(buyer1)
        .purchaseFractions(1, amount, { value: totalCost });

      const balance = await fractional.balanceOf(buyer1.address, 1);
      expect(balance).to.equal(amount);

      // Contract should have fewer fractions
      const contractBalance = await fractional.balanceOf(
        await fractional.getAddress(),
        1
      );
      expect(contractBalance).to.equal(TOTAL_FRACTIONS - amount);
    });

    it("should emit FractionsPurchased event", async function () {
      const amount = 200;
      const totalCost = PRICE_PER_FRACTION * BigInt(amount);

      await expect(
        fractional
          .connect(buyer1)
          .purchaseFractions(1, amount, { value: totalCost })
      )
        .to.emit(fractional, "FractionsPurchased")
        .withArgs(1, buyer1.address, amount, totalCost);
    });

    it("should reject purchase below minimum fractions", async function () {
      const amount = 50; // Below MIN_FRACTIONS (100)
      const totalCost = PRICE_PER_FRACTION * BigInt(amount);

      await expect(
        fractional
          .connect(buyer1)
          .purchaseFractions(1, amount, { value: totalCost })
      )
        .to.be.revertedWithCustomError(fractional, "BelowMinimumFractions")
        .withArgs(amount, MIN_FRACTIONS);
    });

    it("should reject purchase with insufficient payment", async function () {
      const amount = 200;
      const insufficientPayment = PRICE_PER_FRACTION * BigInt(amount - 1); // Not enough

      await expect(
        fractional
          .connect(buyer1)
          .purchaseFractions(1, amount, { value: insufficientPayment })
      ).to.be.revertedWithCustomError(fractional, "InsufficientPayment");
    });

    it("should reject purchase for inactive property", async function () {
      // Property ID 999 does not exist (not fractionalized)
      await expect(
        fractional
          .connect(buyer1)
          .purchaseFractions(999, 100, {
            value: PRICE_PER_FRACTION * BigInt(100),
          })
      ).to.be.revertedWithCustomError(fractional, "PropertyNotActive");
    });

    it("should allow multiple buyers to purchase fractions", async function () {
      const amount1 = 300;
      const amount2 = 500;

      await fractional
        .connect(buyer1)
        .purchaseFractions(1, amount1, {
          value: PRICE_PER_FRACTION * BigInt(amount1),
        });
      await fractional
        .connect(buyer2)
        .purchaseFractions(1, amount2, {
          value: PRICE_PER_FRACTION * BigInt(amount2),
        });

      expect(await fractional.balanceOf(buyer1.address, 1)).to.equal(amount1);
      expect(await fractional.balanceOf(buyer2.address, 1)).to.equal(amount2);

      const contractBalance = await fractional.balanceOf(
        await fractional.getAddress(),
        1
      );
      expect(contractBalance).to.equal(TOTAL_FRACTIONS - amount1 - amount2);
    });

    it("should refund excess payment", async function () {
      const amount = 100;
      const totalCost = PRICE_PER_FRACTION * BigInt(amount);
      const excess = ethers.parseEther("1"); // Send 1 MATIC extra

      const balanceBefore = await ethers.provider.getBalance(buyer1.address);

      const tx = await fractional
        .connect(buyer1)
        .purchaseFractions(1, amount, { value: totalCost + excess });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(buyer1.address);

      // Buyer should have paid only totalCost + gas, not totalCost + excess + gas
      const actualSpent = balanceBefore - balanceAfter;
      expect(actualSpent).to.equal(totalCost + gasUsed);
    });
  });

  describe("Rental Income", function () {
    const PURCHASE_AMOUNT = 1000; // 10% of fractions

    beforeEach(async function () {
      await fractional.fractionalize(
        1,
        TOTAL_FRACTIONS,
        PRICE_PER_FRACTION,
        MIN_FRACTIONS
      );

      // Buyer1 purchases 10% of fractions
      await fractional
        .connect(buyer1)
        .purchaseFractions(1, PURCHASE_AMOUNT, {
          value: PRICE_PER_FRACTION * BigInt(PURCHASE_AMOUNT),
        });
    });

    it("should deposit rental income", async function () {
      const rentalAmount = ethers.parseEther("10");

      await expect(
        fractional.depositRental(1, { value: rentalAmount })
      )
        .to.emit(fractional, "RentalDeposited")
        .withArgs(1, rentalAmount, rentalAmount);

      const prop = await fractional.properties(1);
      expect(prop.totalRentalPool).to.equal(rentalAmount);
    });

    it("should allow claiming proportional rental income", async function () {
      const rentalAmount = ethers.parseEther("10");
      await fractional.depositRental(1, { value: rentalAmount });

      // Buyer1 has 1000 out of 10000 fractions = 10%
      // Expected claim: 10% of 10 MATIC = 1 MATIC
      const expectedClaim =
        (rentalAmount * BigInt(PURCHASE_AMOUNT)) / BigInt(TOTAL_FRACTIONS);

      const balanceBefore = await ethers.provider.getBalance(buyer1.address);

      const tx = await fractional.connect(buyer1).claimRental(1);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(buyer1.address);
      const netGain = balanceAfter - balanceBefore + gasUsed;

      expect(netGain).to.equal(expectedClaim);
    });

    it("should emit RentalClaimed event", async function () {
      const rentalAmount = ethers.parseEther("10");
      await fractional.depositRental(1, { value: rentalAmount });

      const expectedClaim =
        (rentalAmount * BigInt(PURCHASE_AMOUNT)) / BigInt(TOTAL_FRACTIONS);

      await expect(fractional.connect(buyer1).claimRental(1))
        .to.emit(fractional, "RentalClaimed")
        .withArgs(1, buyer1.address, expectedClaim);
    });

    it("should reject claim with no fractions held", async function () {
      const rentalAmount = ethers.parseEther("10");
      await fractional.depositRental(1, { value: rentalAmount });

      // buyer2 has no fractions
      await expect(fractional.connect(buyer2).claimRental(1))
        .to.be.revertedWithCustomError(fractional, "NoFractionsHeld")
        .withArgs(1, buyer2.address);
    });

    it("should reject double claiming", async function () {
      const rentalAmount = ethers.parseEther("10");
      await fractional.depositRental(1, { value: rentalAmount });

      // First claim should succeed
      await fractional.connect(buyer1).claimRental(1);

      // Second claim should fail (nothing more to claim)
      await expect(fractional.connect(buyer1).claimRental(1))
        .to.be.revertedWithCustomError(fractional, "NothingToClaim")
        .withArgs(1, buyer1.address);
    });

    it("should allow claiming after additional rental deposits", async function () {
      const rentalAmount1 = ethers.parseEther("10");
      const rentalAmount2 = ethers.parseEther("5");

      // First deposit and claim
      await fractional.depositRental(1, { value: rentalAmount1 });
      await fractional.connect(buyer1).claimRental(1);

      // Second deposit
      await fractional.depositRental(1, { value: rentalAmount2 });

      // Second claim should only give the new rental share
      const expectedSecondClaim =
        (rentalAmount2 * BigInt(PURCHASE_AMOUNT)) / BigInt(TOTAL_FRACTIONS);

      await expect(fractional.connect(buyer1).claimRental(1))
        .to.emit(fractional, "RentalClaimed")
        .withArgs(1, buyer1.address, expectedSecondClaim);
    });

    it("should distribute proportionally to multiple holders", async function () {
      // Buyer2 purchases 2000 fractions (20%)
      const buyer2Amount = 2000;
      await fractional
        .connect(buyer2)
        .purchaseFractions(1, buyer2Amount, {
          value: PRICE_PER_FRACTION * BigInt(buyer2Amount),
        });

      const rentalAmount = ethers.parseEther("100");
      await fractional.depositRental(1, { value: rentalAmount });

      // Buyer1 has 10%, buyer2 has 20%
      const expected1 =
        (rentalAmount * BigInt(PURCHASE_AMOUNT)) / BigInt(TOTAL_FRACTIONS);
      const expected2 =
        (rentalAmount * BigInt(buyer2Amount)) / BigInt(TOTAL_FRACTIONS);

      await expect(fractional.connect(buyer1).claimRental(1))
        .to.emit(fractional, "RentalClaimed")
        .withArgs(1, buyer1.address, expected1);

      await expect(fractional.connect(buyer2).claimRental(1))
        .to.emit(fractional, "RentalClaimed")
        .withArgs(1, buyer2.address, expected2);
    });

    it("should reject rental deposit from non-admin", async function () {
      await expect(
        fractional
          .connect(unauthorized)
          .depositRental(1, { value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
  });

  describe("supportsInterface", function () {
    it("should support ERC-1155 interface", async function () {
      // ERC-1155 interface ID: 0xd9b67a26
      expect(await fractional.supportsInterface("0xd9b67a26")).to.be.true;
    });

    it("should support AccessControl interface", async function () {
      // IAccessControl interface ID: 0x7965db0b
      expect(await fractional.supportsInterface("0x7965db0b")).to.be.true;
    });

    it("should support ERC-165 interface", async function () {
      // ERC-165 interface ID: 0x01ffc9a7
      expect(await fractional.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });
});
