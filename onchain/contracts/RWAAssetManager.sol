// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, euint32, ebool, externalEuint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title RWAAssetManager
 * @notice Unified contract for asset registry, token factory, compliance, and encrypted RWA tokens
 * @dev Integrates AssetRegistry + RWATokenFactory + ComplianceModule + RWAToken with Zama FHEVM
 * 
 * KEY FHEVM FEATURES:
 * - Encrypted token balances (euint64)
 * - Private transfers (amounts hidden)
 * - Encrypted asset valuations in registry
 * - Confidential compliance checks
 * - DeFi-compatible encrypted collateral verification
 */
contract RWAAssetManager is ZamaEthereumConfig {
    
    // ========== ENUMS ==========
    
    enum AssetType { REAL_ESTATE, INVOICE, VEHICLE, ART, COMMODITY, OTHER }
    enum AssetStatus { ACTIVE, INACTIVE, TRANSFERRED, LIQUIDATED }
    enum JurisdictionType { US, EU, UK, ASIA, OTHER }
    
    // ========== STRUCTS ==========
    
    /**
     * @notice Asset record with ENCRYPTED valuation
     */
    struct Asset {
        uint256 assetId;
        uint256 requestId;
        address tokenAddress;
        address owner;
        AssetType assetType;
        string location;
        euint64 encryptedValuation;    // 🔐 ENCRYPTED valuation
        euint32 encryptedConfidence;   // 🔐 ENCRYPTED confidence
        bytes32 evidenceHash;
        uint256 createdAt;
        uint256 lastUpdated;
        AssetStatus status;
    }
    
    /**
     * @notice Token metadata (public info)
     */
    struct TokenMetadata {
        uint256 assetId;
        string name;
        string symbol;
        address creator;
        uint256 createdAt;
        bool transfersEnabled;
    }
    
    /**
     * @notice Compliance data
     */
    struct ComplianceData {
        bool kycVerified;
        bool accreditedInvestor;
        JurisdictionType jurisdiction;
        uint256 verificationDate;
        uint256 expirationDate;
        bool restricted;
    }
    
    // ========== STATE VARIABLES ==========
    
    // Asset Registry
    uint256 private assetCounter;
    mapping(uint256 => Asset) public assets;
    mapping(address => uint256[]) public ownerAssets;
    mapping(uint256 => uint256) public requestToAsset; // requestId => assetId
    mapping(address => uint256) public tokenToAsset; // tokenAddress => assetId
    
    // Token Factory
    mapping(uint256 => address) public assetToToken; // assetId => tokenAddress
    address[] public allTokens;
    
    // Token Storage (assetId => holder => encrypted balance)
    mapping(uint256 => mapping(address => euint64)) private encryptedBalances;
    mapping(uint256 => euint64) private encryptedTotalSupply;
    mapping(uint256 => TokenMetadata) public tokenMetadata;
    
    // Token Allowances (for transferFrom)
    mapping(uint256 => mapping(address => mapping(address => euint64))) private encryptedAllowances;
    
    // Compliance Module
    mapping(address => ComplianceData) public userCompliance;
    mapping(JurisdictionType => bool) public restrictedJurisdictions;
    uint256 public kycValidityPeriod = 365 days;
    
    // Whitelisting
    mapping(uint256 => mapping(address => bool)) public tokenWhitelist;
    
    // Admin system
    mapping(address => bool) public admins; // 🆕 Multi-admin system
    
    // Contract addresses
    address public oracleCore;
    address public owner;
    
    // ========== EVENTS ==========
    
    // Asset Registry Events
    event AssetRegistered(
        uint256 indexed assetId,
        uint256 indexed requestId,
        address indexed owner,
        address tokenAddress
    );
    
    event AssetUpdated(
        uint256 indexed assetId,
        uint256 timestamp
    );
    
    event AssetTransferred(
        uint256 indexed assetId,
        address indexed from,
        address indexed to
    );
    
    event AssetStatusChanged(
        uint256 indexed assetId,
        AssetStatus newStatus
    );
    
    // Token Events (amounts are NOT revealed)
    event TokenCreated(
        uint256 indexed assetId,
        address indexed tokenAddress,
        address indexed owner,
        string name,
        string symbol
    );
    
    event Transfer(
        uint256 indexed assetId,
        address indexed from,
        address indexed to
        // 🔐 Amount is ENCRYPTED - not in event!
    );
    
    event Approval(
        uint256 indexed assetId,
        address indexed owner,
        address indexed spender
        // 🔐 Amount is ENCRYPTED - not in event!
    );
    
    // Compliance Events
    event KYCVerified(address indexed user, JurisdictionType jurisdiction);
    event KYCRevoked(address indexed user);
    event AccreditedInvestorSet(address indexed user, bool status);
    event UserRestricted(address indexed user, bool restricted);
    
    // Admin Events
    event AdminAdded(address indexed admin); // 🆕
    event AdminRemoved(address indexed admin); // 🆕
    
    // ========== MODIFIERS ==========
    
    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyOracleCore() {
        require(msg.sender == oracleCore, "Not oracle core");
        _;
    }
    
    modifier onlyAssetOwner(uint256 _assetId) {
        require(assets[_assetId].owner == msg.sender, "Not asset owner");
        _;
    }
    
    modifier tokenExists(uint256 _assetId) {
        require(assetToToken[_assetId] != address(0), "Token does not exist");
        _;
    }
    
    // ========== CONSTRUCTOR ==========
    
    constructor(address _oracleCore) {
        owner = msg.sender;
        admins[msg.sender] = true; // 🆕 Deployer is first admin
        oracleCore = _oracleCore;
        assetCounter = 0;
    }
    
    // ========== ADMIN MANAGEMENT (PUBLIC) ==========
    
    /**
     * @notice Add admin (any existing admin can add new admins)
     * @dev Allows your team to manage the contract collaboratively
     */
    function addAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Invalid address");
        require(!admins[_newAdmin], "Already admin");
        
        admins[_newAdmin] = true;
        emit AdminAdded(_newAdmin);
    }
    
    /**
     * @notice Remove admin
     */
    function removeAdmin(address _admin) external onlyAdmin {
        require(_admin != owner, "Cannot remove owner");
        require(admins[_admin], "Not an admin");
        
        admins[_admin] = false;
        emit AdminRemoved(_admin);
    }
    
    /**
     * @notice Check if address is admin
     */
    function isAdmin(address _account) external view returns (bool) {
        return admins[_account];
    }
    
    // ========== ASSET REGISTRY FUNCTIONS ==========
    
    /**
     * @notice Register new asset with ENCRYPTED valuation
     * @dev Called by OracleCore after consensus - uses proper FHEVM pattern
     */
    function registerAsset(
        uint256 _requestId,
        address _owner,
        AssetType _assetType,
        string memory _location,
        externalEuint64 _encryptedValuation,
        bytes calldata _valuationProof,
        externalEuint32 _encryptedConfidence,
        bytes calldata _confidenceProof,
        bytes32 _evidenceHash
    ) external onlyOracleCore returns (uint256) {
        require(_owner != address(0), "Invalid owner");
        require(requestToAsset[_requestId] == 0, "Request already registered");
        
        // Convert external encrypted values to internal euint types
        euint64 encryptedValuation = FHE.fromExternal(_encryptedValuation, _valuationProof);
        euint32 encryptedConfidence = FHE.fromExternal(_encryptedConfidence, _confidenceProof);
        
        uint256 assetId = ++assetCounter;
        
        // Allow this contract to use encrypted values
        FHE.allowThis(encryptedValuation);
        FHE.allowThis(encryptedConfidence);
        
        Asset storage asset = assets[assetId];
        asset.assetId = assetId;
        asset.requestId = _requestId;
        asset.owner = _owner;
        asset.assetType = _assetType;
        asset.location = _location;
        asset.encryptedValuation = encryptedValuation;    // 🔐 Store encrypted
        asset.encryptedConfidence = encryptedConfidence;  // 🔐 Store encrypted
        asset.evidenceHash = _evidenceHash;
        asset.createdAt = block.timestamp;
        asset.lastUpdated = block.timestamp;
        asset.status = AssetStatus.ACTIVE;
        
        ownerAssets[_owner].push(assetId);
        requestToAsset[_requestId] = assetId;
        
        // Create token for this asset
        address tokenAddress = _createToken(assetId, _owner, encryptedValuation);
        asset.tokenAddress = tokenAddress;
        tokenToAsset[tokenAddress] = assetId;
        
        emit AssetRegistered(assetId, _requestId, _owner, tokenAddress);
        
        return assetId;
    }
    
    /**
     * @notice Update asset valuation (re-valuation)
     * @dev Uses proper FHEVM pattern with proofs
     */
    function updateValuation(
        uint256 _assetId,
        externalEuint64 _newEncryptedValuation,
        bytes calldata _valuationProof,
        externalEuint32 _newEncryptedConfidence,
        bytes calldata _confidenceProof,
        bytes32 _evidenceHash
    ) external onlyOracleCore {
        require(assets[_assetId].assetId != 0, "Asset not found");
        
        // Convert external encrypted values to internal euint types
        euint64 encryptedValuation = FHE.fromExternal(_newEncryptedValuation, _valuationProof);
        euint32 encryptedConfidence = FHE.fromExternal(_newEncryptedConfidence, _confidenceProof);
        
        FHE.allowThis(encryptedValuation);
        FHE.allowThis(encryptedConfidence);
        
        Asset storage asset = assets[_assetId];
        asset.encryptedValuation = encryptedValuation;
        asset.encryptedConfidence = encryptedConfidence;
        asset.evidenceHash = _evidenceHash;
        asset.lastUpdated = block.timestamp;
        
        emit AssetUpdated(_assetId, block.timestamp);
    }
    
    /**
     * @notice Transfer asset ownership
     */
    function transferAsset(uint256 _assetId, address _newOwner) 
        external 
        onlyAssetOwner(_assetId) 
    {
        require(_newOwner != address(0), "Invalid new owner");
        
        address previousOwner = assets[_assetId].owner;
        assets[_assetId].owner = _newOwner;
        assets[_assetId].lastUpdated = block.timestamp;
        
        ownerAssets[_newOwner].push(_assetId);
        
        emit AssetTransferred(_assetId, previousOwner, _newOwner);
    }
    
    /**
     * @notice Update asset status (any admin can update)
     */
    function updateAssetStatus(uint256 _assetId, AssetStatus _newStatus) external onlyAdmin {
        require(assets[_assetId].assetId != 0, "Asset not found");
        
        assets[_assetId].status = _newStatus;
        assets[_assetId].lastUpdated = block.timestamp;
        
        emit AssetStatusChanged(_assetId, _newStatus);
    }
    
    /**
     * @notice Get encrypted asset valuation (owner only)
     */
    function getEncryptedAssetValuation(uint256 _assetId) external view returns (euint64) {
        require(assets[_assetId].owner == msg.sender, "Not owner");
        
        return assets[_assetId].encryptedValuation;
    }
    
    // ========== TOKEN FACTORY & ERC20 FUNCTIONS ==========
    
    /**
     * @notice Create new encrypted RWA token
     * @dev Automatically called during asset registration
     */
    function _createToken(
        uint256 _assetId,
        address _owner,
        euint64 _encryptedValuation
    ) internal returns (address) {
        string memory tokenName = string(abi.encodePacked("RWA Asset #", _toString(_assetId)));
        string memory tokenSymbol = string(abi.encodePacked("RWA", _toString(_assetId)));
        
        // Store token metadata
        tokenMetadata[_assetId] = TokenMetadata({
            assetId: _assetId,
            name: tokenName,
            symbol: tokenSymbol,
            creator: _owner,
            createdAt: block.timestamp,
            transfersEnabled: false // Disabled by default
        });
        
        // 🔐 Set encrypted total supply = encrypted valuation
        FHE.allowThis(_encryptedValuation);
        encryptedTotalSupply[_assetId] = _encryptedValuation;
        
        // 🔐 Mint all tokens to owner (encrypted balance)
        encryptedBalances[_assetId][_owner] = _encryptedValuation;
        
        // Allow owner to access their balance
        FHE.allow(_encryptedValuation, _owner);
        
        // Create pseudo-address for this token
        address tokenAddress = address(uint160(uint256(keccak256(abi.encodePacked(_assetId, block.timestamp)))));
        
        assetToToken[_assetId] = tokenAddress;
        allTokens.push(tokenAddress);
        
        // Whitelist owner
        tokenWhitelist[_assetId][_owner] = true;
        
        emit TokenCreated(_assetId, tokenAddress, _owner, tokenName, tokenSymbol);
        
        return tokenAddress;
    }
    
    /**
     * @notice Get encrypted balance (user can decrypt client-side)
     * @dev Returns encrypted balance handle
     */
    function balanceOf(
        uint256 _assetId,
        address _account
    ) external view tokenExists(_assetId) returns (euint64) {
        require(_account == msg.sender, "Can only check own balance");
        
        return encryptedBalances[_assetId][_account];
    }
    
    /**
     * @notice Get encrypted total supply
     */
    function totalSupply(
        uint256 _assetId
    ) external view tokenExists(_assetId) returns (euint64) {
        // Only asset owner can see total supply
        require(assets[_assetId].owner == msg.sender, "Not owner");
        
        return encryptedTotalSupply[_assetId];
    }
    
    /**
     * @notice ENCRYPTED TRANSFER
     * @dev Transfer encrypted amount between addresses
     */
    function transfer(
        uint256 _assetId,
        address _to,
        externalEuint64 _encryptedAmount,
        bytes calldata _amountProof
    ) external tokenExists(_assetId) returns (bool) {
        require(_to != address(0), "Invalid recipient");
        require(_to != msg.sender, "Cannot transfer to self");
        
        // Check compliance
        require(_checkTransferAllowed(msg.sender, _to), "Transfer not allowed");
        
        // Check if transfers enabled or user whitelisted
        require(
            tokenMetadata[_assetId].transfersEnabled || 
            tokenWhitelist[_assetId][msg.sender] || 
            tokenWhitelist[_assetId][_to],
            "Transfers disabled"
        );
        
        // 🔐 Convert to encrypted type
        euint64 amount = FHE.fromExternal(_encryptedAmount, _amountProof);
        
        // 🔐 Check if sender has enough (encrypted comparison)
        ebool hasEnough = FHE.le(amount, encryptedBalances[_assetId][msg.sender]);
        
        // 🔐 Select amount to transfer (0 if insufficient)
        euint64 transferAmount = FHE.select(
            hasEnough,
            amount,
            FHE.asEuint64(0)
        );
        
        // 🔐 Update balances (encrypted arithmetic)
        encryptedBalances[_assetId][msg.sender] = FHE.sub(
            encryptedBalances[_assetId][msg.sender],
            transferAmount
        );
        
        encryptedBalances[_assetId][_to] = FHE.add(
            encryptedBalances[_assetId][_to],
            transferAmount
        );
        
        // Allow participants to access updated balances
        FHE.allow(encryptedBalances[_assetId][msg.sender], msg.sender);
        FHE.allow(encryptedBalances[_assetId][_to], _to);
        
        emit Transfer(_assetId, msg.sender, _to);
        
        return true;
    }
    
    /**
     * @notice Approve spender to transfer tokens
     */
    function approve(
        uint256 _assetId,
        address _spender,
        externalEuint64 _encryptedAmount,
        bytes calldata _amountProof
    ) external tokenExists(_assetId) returns (bool) {
        require(_spender != address(0), "Invalid spender");
        
        euint64 amount = FHE.fromExternal(_encryptedAmount, _amountProof);
        
        encryptedAllowances[_assetId][msg.sender][_spender] = amount;
        
        // Allow spender to see allowance
        FHE.allow(amount, _spender);
        
        emit Approval(_assetId, msg.sender, _spender);
        
        return true;
    }
    
    /**
     * @notice Transfer from (using allowance)
     */
    function transferFrom(
        uint256 _assetId,
        address _from,
        address _to,
        externalEuint64 _encryptedAmount,
        bytes calldata _amountProof
    ) external tokenExists(_assetId) returns (bool) {
        require(_to != address(0), "Invalid recipient");
        require(_checkTransferAllowed(_from, _to), "Transfer not allowed");
        
        euint64 amount = FHE.fromExternal(_encryptedAmount, _amountProof);
        
        // 🔐 Check allowance
        euint64 currentAllowance = encryptedAllowances[_assetId][_from][msg.sender];
        ebool hasAllowance = FHE.le(amount, currentAllowance);
        
        // 🔐 Check balance
        ebool hasBalance = FHE.le(amount, encryptedBalances[_assetId][_from]);
        
        // 🔐 Both conditions must be true
        ebool canTransfer = FHE.and(hasAllowance, hasBalance);
        
        euint64 transferAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));
        
        // 🔐 Update balances
        encryptedBalances[_assetId][_from] = FHE.sub(
            encryptedBalances[_assetId][_from],
            transferAmount
        );
        
        encryptedBalances[_assetId][_to] = FHE.add(
            encryptedBalances[_assetId][_to],
            transferAmount
        );
        
        // 🔐 Update allowance
        encryptedAllowances[_assetId][_from][msg.sender] = FHE.sub(
            currentAllowance,
            transferAmount
        );
        
        // Update permissions
        FHE.allow(encryptedBalances[_assetId][_from], _from);
        FHE.allow(encryptedBalances[_assetId][_to], _to);
        
        emit Transfer(_assetId, _from, _to);
        
        return true;
    }
    
    /**
     * @notice Enable token transfers
     */
    function enableTransfers(uint256 _assetId) external onlyAssetOwner(_assetId) {
        tokenMetadata[_assetId].transfersEnabled = true;
    }
    
    /**
     * @notice Disable token transfers
     */
    function disableTransfers(uint256 _assetId) external onlyAssetOwner(_assetId) {
        tokenMetadata[_assetId].transfersEnabled = false;
    }
    
    /**
     * @notice Add address to whitelist
     */
    function addToWhitelist(uint256 _assetId, address _account) external onlyAssetOwner(_assetId) {
        tokenWhitelist[_assetId][_account] = true;
    }
    
    /**
     * @notice Remove from whitelist
     */
    function removeFromWhitelist(uint256 _assetId, address _account) external onlyAssetOwner(_assetId) {
        tokenWhitelist[_assetId][_account] = false;
    }
    
    // ========== COMPLIANCE MODULE (TEAM ACCESS) ==========
    
    /**
     * @notice Set KYC verification status (any admin can verify)
     */
    function setKYCStatus(
        address _user,
        bool _verified,
        JurisdictionType _jurisdiction
    ) external onlyAdmin {
        ComplianceData storage data = userCompliance[_user];
        data.kycVerified = _verified;
        data.jurisdiction = _jurisdiction;
        data.verificationDate = block.timestamp;
        data.expirationDate = block.timestamp + kycValidityPeriod;
        
        if (_verified) {
            emit KYCVerified(_user, _jurisdiction);
        } else {
            emit KYCRevoked(_user);
        }
    }
    
    /**
     * @notice Check if user is KYC verified
     */
    function isKYCVerified(address _user) public view returns (bool) {
        ComplianceData memory data = userCompliance[_user];
        return data.kycVerified && 
               block.timestamp <= data.expirationDate &&
               !data.restricted &&
               !restrictedJurisdictions[data.jurisdiction];
    }
    
    /**
     * @notice Set accredited investor status (any admin)
     */
    function setAccreditedInvestor(address _user, bool _status) external onlyAdmin {
        userCompliance[_user].accreditedInvestor = _status;
        emit AccreditedInvestorSet(_user, _status);
    }
    
    /**
     * @notice Restrict user (any admin)
     */
    function setUserRestriction(address _user, bool _restricted) external onlyAdmin {
        userCompliance[_user].restricted = _restricted;
        emit UserRestricted(_user, _restricted);
    }
    
    /**
     * @notice Check if transfer is allowed (compliance)
     */
    function _checkTransferAllowed(address _from, address _to) internal view returns (bool) {
        return isKYCVerified(_from) && isKYCVerified(_to);
    }
    
    /**
     * @notice Batch KYC verification (any admin)
     */
    function batchSetKYC(
        address[] calldata _users,
        bool[] calldata _verified,
        JurisdictionType[] calldata _jurisdictions
    ) external onlyAdmin {
        require(
            _users.length == _verified.length && 
            _users.length == _jurisdictions.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < _users.length; i++) {
            ComplianceData storage data = userCompliance[_users[i]];
            data.kycVerified = _verified[i];
            data.jurisdiction = _jurisdictions[i];
            data.verificationDate = block.timestamp;
            data.expirationDate = block.timestamp + kycValidityPeriod;
            
            if (_verified[i]) {
                emit KYCVerified(_users[i], _jurisdictions[i]);
            }
        }
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    /**
     * @notice Get asset details (public data only)
     */
    function getAsset(uint256 _assetId) external view returns (
        uint256 assetId,
        uint256 requestId,
        address tokenAddress,
        address assetOwner,
        AssetType assetType,
        string memory location,
        bytes32 evidenceHash,
        uint256 createdAt,
        uint256 lastUpdated,
        AssetStatus status
    ) {
        Asset storage asset = assets[_assetId];
        return (
            asset.assetId,
            asset.requestId,
            asset.tokenAddress,
            asset.owner,
            asset.assetType,
            asset.location,
            asset.evidenceHash,
            asset.createdAt,
            asset.lastUpdated,
            asset.status
        );
    }
    
    /**
     * @notice Get assets by owner
     */
    function getAssetsByOwner(address _owner) external view returns (uint256[] memory) {
        return ownerAssets[_owner];
    }
    
    /**
     * @notice Get asset by request ID
     */
    function getAssetByRequest(uint256 _requestId) external view returns (uint256) {
        return requestToAsset[_requestId];
    }
    
    /**
     * @notice Get all tokens
     */
    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }
    
    /**
     * @notice Get token metadata
     */
    function getTokenMetadata(uint256 _assetId) external view returns (TokenMetadata memory) {
        return tokenMetadata[_assetId];
    }
    
    // ========== ADMIN FUNCTIONS (TEAM ACCESS) ==========
    
    /**
     * @notice Set oracle core address (any admin)
     */
    function setOracleCore(address _oracleCore) external onlyAdmin {
        oracleCore = _oracleCore;
    }
    
    /**
     * @notice Set KYC validity period (any admin)
     */
    function setKYCValidityPeriod(uint256 _period) external onlyAdmin {
        kycValidityPeriod = _period;
    }
    
    /**
     * @notice Restrict jurisdiction (any admin)
     */
    function setJurisdictionRestriction(JurisdictionType _jurisdiction, bool _restricted) external onlyAdmin {
        restrictedJurisdictions[_jurisdiction] = _restricted;
    }
    
    /**
     * @notice Transfer ownership (only current owner)
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        
        // Remove old owner from admins and add new owner
        admins[owner] = false;
        admins[newOwner] = true;
        
        owner = newOwner;
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    /**
     * @notice Convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
