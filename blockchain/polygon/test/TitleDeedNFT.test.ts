import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { TitleDeedNFT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TitleDeedNFT", function () {
  let titleDeed: TitleDeedNFT;
  let govAdmin: HardhatEthersSigner;
  let citizen1: HardhatEthersSigner;
  let citizen2: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;

  // Realistic Indian test data
  const PROPERTY_ID = "MP-IND-001-0042";
  const FABRIC_TX_HASH =
    "fab_tx_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
  const ALGORAND_ASA_ID = 123456789;
  const DOCUMENT_CID = "QmYwAPJzv5CZsnAzt8auVZRnGNMFY9oNafi1FdP7BkiJyr";
  const OWNER_AADHAAR_HASH =
    "b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c";
  const AREA_SQ_METERS = 500;
  const STATE_CODE = "MP";

  beforeEach(async function () {
    [govAdmin, citizen1, citizen2, unauthorized] = await ethers.getSigners();

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
  });

  describe("Initialization", function () {
    it("should set the correct name and symbol", async function () {
      expect(await titleDeed.name()).to.equal("BhulekhChain Title Deed");
      expect(await titleDeed.symbol()).to.equal("BKTITLE");
    });

    it("should grant GOVT_ADMIN_ROLE to the govAdmin", async function () {
      const GOVT_ADMIN_ROLE = await titleDeed.GOVT_ADMIN_ROLE();
      expect(await titleDeed.hasRole(GOVT_ADMIN_ROLE, govAdmin.address)).to.be
        .true;
    });

    it("should grant UPGRADER_ROLE to the govAdmin", async function () {
      const UPGRADER_ROLE = await titleDeed.UPGRADER_ROLE();
      expect(await titleDeed.hasRole(UPGRADER_ROLE, govAdmin.address)).to.be
        .true;
    });

    it("should grant DEFAULT_ADMIN_ROLE to the govAdmin", async function () {
      const DEFAULT_ADMIN_ROLE = await titleDeed.DEFAULT_ADMIN_ROLE();
      expect(await titleDeed.hasRole(DEFAULT_ADMIN_ROLE, govAdmin.address)).to
        .be.true;
    });
  });

  describe("Minting", function () {
    it("should mint a title deed (only govt admin)", async function () {
      const tx = await titleDeed.mintTitle(
        citizen1.address,
        PROPERTY_ID,
        FABRIC_TX_HASH,
        ALGORAND_ASA_ID,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        AREA_SQ_METERS,
        STATE_CODE
      );

      const receipt = await tx.wait();

      // Verify ownership
      expect(await titleDeed.ownerOf(1)).to.equal(citizen1.address);

      // Verify token data
      const deed = await titleDeed.titleDeeds(1);
      expect(deed.propertyId).to.equal(PROPERTY_ID);
      expect(deed.fabricTxHash).to.equal(FABRIC_TX_HASH);
      expect(deed.algorandAsaId).to.equal(ALGORAND_ASA_ID);
      expect(deed.documentCID).to.equal(DOCUMENT_CID);
      expect(deed.ownerAadhaarHash).to.equal(OWNER_AADHAAR_HASH);
      expect(deed.areaSqMeters).to.equal(AREA_SQ_METERS);
      expect(deed.stateCode).to.equal(STATE_CODE);
      expect(deed.fractionalizable).to.be.false;
      expect(deed.transferApproved).to.be.false;

      // Verify propertyId mapping
      expect(await titleDeed.propertyIdToTokenId(PROPERTY_ID)).to.equal(1);
    });

    it("should emit TitleMinted event", async function () {
      await expect(
        titleDeed.mintTitle(
          citizen1.address,
          PROPERTY_ID,
          FABRIC_TX_HASH,
          ALGORAND_ASA_ID,
          DOCUMENT_CID,
          OWNER_AADHAAR_HASH,
          AREA_SQ_METERS,
          STATE_CODE
        )
      )
        .to.emit(titleDeed, "TitleMinted")
        .withArgs(1, PROPERTY_ID, OWNER_AADHAAR_HASH, citizen1.address);
    });

    it("should reject mint from non-admin", async function () {
      await expect(
        titleDeed
          .connect(unauthorized)
          .mintTitle(
            citizen1.address,
            PROPERTY_ID,
            FABRIC_TX_HASH,
            ALGORAND_ASA_ID,
            DOCUMENT_CID,
            OWNER_AADHAAR_HASH,
            AREA_SQ_METERS,
            STATE_CODE
          )
      ).to.be.reverted;
    });

    it("should reject duplicate property tokenization", async function () {
      await titleDeed.mintTitle(
        citizen1.address,
        PROPERTY_ID,
        FABRIC_TX_HASH,
        ALGORAND_ASA_ID,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        AREA_SQ_METERS,
        STATE_CODE
      );

      await expect(
        titleDeed.mintTitle(
          citizen2.address,
          PROPERTY_ID, // same property ID
          "fab_tx_different",
          999999,
          "QmDifferentCID",
          "different_hash",
          600,
          "MP"
        )
      )
        .to.be.revertedWithCustomError(titleDeed, "PropertyAlreadyTokenized")
        .withArgs(PROPERTY_ID);
    });

    it("should auto-increment token IDs", async function () {
      await titleDeed.mintTitle(
        citizen1.address,
        "MP-IND-001-0001",
        FABRIC_TX_HASH,
        100,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        500,
        STATE_CODE
      );
      await titleDeed.mintTitle(
        citizen2.address,
        "MP-IND-001-0002",
        FABRIC_TX_HASH,
        200,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        600,
        STATE_CODE
      );

      expect(await titleDeed.ownerOf(1)).to.equal(citizen1.address);
      expect(await titleDeed.ownerOf(2)).to.equal(citizen2.address);
    });
  });

  describe("Transfer Approval", function () {
    beforeEach(async function () {
      await titleDeed.mintTitle(
        citizen1.address,
        PROPERTY_ID,
        FABRIC_TX_HASH,
        ALGORAND_ASA_ID,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        AREA_SQ_METERS,
        STATE_CODE
      );
    });

    it("should require government approval for transfer", async function () {
      await expect(
        titleDeed
          .connect(citizen1)
          .transferFrom(citizen1.address, citizen2.address, 1)
      ).to.be.revertedWithCustomError(
        titleDeed,
        "GovernmentApprovalRequired"
      );
    });

    it("should allow transfer after government approval", async function () {
      // Approve transfer
      await titleDeed.approveTransfer(1, citizen2.address);

      // Now transfer should work
      await titleDeed
        .connect(citizen1)
        .transferFrom(citizen1.address, citizen2.address, 1);

      expect(await titleDeed.ownerOf(1)).to.equal(citizen2.address);
    });

    it("should emit TransferApproved event", async function () {
      await expect(titleDeed.approveTransfer(1, citizen2.address))
        .to.emit(titleDeed, "TransferApproved")
        .withArgs(1, citizen2.address);
    });

    it("should reset approval after transfer", async function () {
      await titleDeed.approveTransfer(1, citizen2.address);
      await titleDeed
        .connect(citizen1)
        .transferFrom(citizen1.address, citizen2.address, 1);

      // Approval should be reset - transferring again should fail
      await expect(
        titleDeed
          .connect(citizen2)
          .transferFrom(citizen2.address, citizen1.address, 1)
      ).to.be.revertedWithCustomError(
        titleDeed,
        "GovernmentApprovalRequired"
      );
    });

    it("should reject transfer to wrong recipient", async function () {
      await titleDeed.approveTransfer(1, citizen2.address);

      // Try to transfer to unauthorized (not the approved recipient)
      await expect(
        titleDeed
          .connect(citizen1)
          .transferFrom(citizen1.address, unauthorized.address, 1)
      ).to.be.revertedWithCustomError(
        titleDeed,
        "TransferRecipientMismatch"
      );
    });
  });

  describe("Fractionalization", function () {
    beforeEach(async function () {
      await titleDeed.mintTitle(
        citizen1.address,
        PROPERTY_ID,
        FABRIC_TX_HASH,
        ALGORAND_ASA_ID,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        AREA_SQ_METERS,
        STATE_CODE
      );
    });

    it("should enable fractionalization", async function () {
      await titleDeed.enableFractionalization(1);

      const deed = await titleDeed.titleDeeds(1);
      expect(deed.fractionalizable).to.be.true;
    });

    it("should emit FractionalizationEnabled event", async function () {
      await expect(titleDeed.enableFractionalization(1))
        .to.emit(titleDeed, "FractionalizationEnabled")
        .withArgs(1);
    });

    it("should reject enableFractionalization from non-admin", async function () {
      await expect(
        titleDeed.connect(unauthorized).enableFractionalization(1)
      ).to.be.reverted;
    });

    it("should reject enableFractionalization for non-existent token", async function () {
      await expect(titleDeed.enableFractionalization(999))
        .to.be.revertedWithCustomError(titleDeed, "TokenDoesNotExist")
        .withArgs(999);
    });
  });

  describe("Verification", function () {
    beforeEach(async function () {
      await titleDeed.mintTitle(
        citizen1.address,
        PROPERTY_ID,
        FABRIC_TX_HASH,
        ALGORAND_ASA_ID,
        DOCUMENT_CID,
        OWNER_AADHAAR_HASH,
        AREA_SQ_METERS,
        STATE_CODE
      );
    });

    it("should return three-chain verification data", async function () {
      const verification = await titleDeed.getVerification(1);

      expect(verification.propertyId).to.equal(PROPERTY_ID);
      expect(verification.fabricTxHash).to.equal(FABRIC_TX_HASH);
      expect(verification.algorandAsaId).to.equal(ALGORAND_ASA_ID);
      expect(verification.documentCID).to.equal(DOCUMENT_CID);
    });

    it("should revert for non-existent token", async function () {
      await expect(titleDeed.getVerification(999))
        .to.be.revertedWithCustomError(titleDeed, "TokenDoesNotExist")
        .withArgs(999);
    });
  });

  describe("Pause / Unpause", function () {
    it("should pause and prevent minting", async function () {
      await titleDeed.pause();

      await expect(
        titleDeed.mintTitle(
          citizen1.address,
          PROPERTY_ID,
          FABRIC_TX_HASH,
          ALGORAND_ASA_ID,
          DOCUMENT_CID,
          OWNER_AADHAAR_HASH,
          AREA_SQ_METERS,
          STATE_CODE
        )
      ).to.be.revertedWithCustomError(titleDeed, "EnforcedPause");
    });

    it("should unpause and allow minting again", async function () {
      await titleDeed.pause();
      await titleDeed.unpause();

      await expect(
        titleDeed.mintTitle(
          citizen1.address,
          PROPERTY_ID,
          FABRIC_TX_HASH,
          ALGORAND_ASA_ID,
          DOCUMENT_CID,
          OWNER_AADHAAR_HASH,
          AREA_SQ_METERS,
          STATE_CODE
        )
      ).to.not.be.reverted;
    });

    it("should reject pause from non-admin", async function () {
      await expect(titleDeed.connect(unauthorized).pause()).to.be.reverted;
    });

    it("should reject unpause from non-admin", async function () {
      await titleDeed.pause();
      await expect(titleDeed.connect(unauthorized).unpause()).to.be.reverted;
    });
  });

  describe("supportsInterface", function () {
    it("should support ERC-721 interface", async function () {
      // ERC-721 interface ID: 0x80ac58cd
      expect(await titleDeed.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support AccessControl interface", async function () {
      // IAccessControl interface ID: 0x7965db0b
      expect(await titleDeed.supportsInterface("0x7965db0b")).to.be.true;
    });

    it("should support ERC-165 interface", async function () {
      // ERC-165 interface ID: 0x01ffc9a7
      expect(await titleDeed.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });
});
