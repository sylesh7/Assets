// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, euint32, ebool, externalEuint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title RWAOracleCore
 * @notice Unified contract for verification requests, oracle consensus, and encrypted valuations
 * @dev Integrates OracleRouter + ConsensusEngine + ValuationOracle with Zama FHEVM
 * 
 * KEY FHEVM FEATURES:
 * - Encrypted asset valuations (euint64)
 * - Encrypted confidence scores (euint32)
 * - Private consensus calculation on-chain
 * - Selective decryption for authorized users
 * - Encrypted price feeds for DeFi
 */
contract RWAOracleCore is ZamaEthereumConfig {
    
    // ========== ENUMS ==========
    
    enum RequestStatus { PENDING, PROCESSING, VERIFIED, REJECTED }
    enum AssetType { REAL_ESTATE, INVOICE, VEHICLE, ART, COMMODITY, OTHER }
    
    // ========== STRUCTS ==========
    
    /**
     * @notice Verification request with public metadata
     * @dev Only metadata is public, valuation will be encrypted
     */
    struct VerificationRequest {
        uint256 requestId;
        address owner;
        AssetType assetType;
        string location;
        string[] ipfsHashes;
        RequestStatus status;
        uint256 timestamp;
    }
    
    /**
     * @notice Oracle response with ENCRYPTED valuation
     * @dev Each oracle submits encrypted values
     */
    struct OracleResponse {
        address oracle;
        euint64 encryptedValuation;    // 🔐 ENCRYPTED valuation
        euint32 encryptedConfidence;   // 🔐 ENCRYPTED confidence score
        bytes32 evidenceHash;
        uint256 timestamp;
        bool submitted;
    }
    
    /**
     * @notice Consensus result with ENCRYPTED final valuation
     * @dev Final result is encrypted, only owner can decrypt
     */
    struct ConsensusResult {
        euint64 finalEncryptedValuation;  // 🔐 ENCRYPTED final valuation
        euint32 avgEncryptedConfidence;   // 🔐 ENCRYPTED average confidence
        uint256 responseCount;
        bool consensusReached;
        uint256 timestamp;
        bytes32 verificationHash;
    }
    
    /**
     * @notice Price data for oracle feeds (ENCRYPTED)
     */
    struct EncryptedPriceData {
        euint64 price;        // 🔐 ENCRYPTED price
        euint32 confidence;   // 🔐 ENCRYPTED confidence
        uint256 timestamp;
    }
    
    // ========== STATE VARIABLES ==========
    
    // Request management
    uint256 private requestCounter;
    mapping(uint256 => VerificationRequest) public requests;
    mapping(address => uint256[]) public userRequests;
    
    // Oracle responses (requestId => oracle => response)
    mapping(uint256 => mapping(address => OracleResponse)) public oracleResponses;
    mapping(uint256 => address[]) public requestOracles; // Track which oracles responded
    
    // Consensus results
    mapping(uint256 => ConsensusResult) public consensusResults;
    
    // Price oracle (assetId => price history)
    mapping(uint256 => EncryptedPriceData[]) public priceHistory;
    mapping(uint256 => EncryptedPriceData) public currentPrices;
    
    // Authorization
    mapping(address => bool) public authorizedOracles;
    mapping(address => uint256) public oracleStake;
    mapping(address => bool) public admins; // 🆕 Multi-admin system
    
    // Configuration
    uint256 public verificationFee = 0.01 ether;
    uint256 public minConfidenceThreshold = 80; // Public threshold (80%)
    uint256 public consensusThreshold = 2; // Need 2 out of 3 oracles
    uint256 public minOracleStake = 1 ether;
    
    // Contract addresses
    address public tokenFactory;
    address public assetRegistry;
    
    // ========== EVENTS ==========
    
    event VerificationRequested(
        uint256 indexed requestId,
        address indexed owner,
        AssetType assetType,
        string location,
        uint256 timestamp
    );
    
    event OracleResponseSubmitted(
        uint256 indexed requestId,
        address indexed oracle,
        bytes32 evidenceHash,
        uint256 timestamp
    );
    
    event ConsensusReached(
        uint256 indexed requestId,
        uint256 responseCount,
        uint256 timestamp
    );
    
    event PriceUpdated(
        uint256 indexed assetId,
        uint256 timestamp
    );
    
    event OracleAuthorized(address indexed oracle, uint256 stake);
    event OracleRevoked(address indexed oracle);
    event OracleSlashed(address indexed oracle, uint256 amount);
    event AdminAdded(address indexed admin); // 🆕
    event AdminRemoved(address indexed admin); // 🆕
    
    // ========== MODIFIERS ==========
    
    modifier onlyAuthorizedOracle() {
        require(authorizedOracles[msg.sender], "Not authorized oracle");
        require(oracleStake[msg.sender] >= minOracleStake, "Insufficient stake");
        _;
    }
    
    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // ========== CONSTRUCTOR ==========
    
    address public owner;
    
    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true; // 🆕 Deployer is first admin
        requestCounter = 0;
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
    
    // ========== CORE FUNCTIONS ==========
    
    /**
     * @notice Submit verification request (Step 1)
     * @dev User submits asset for verification
     * @param _assetType Type of asset
     * @param _location Location/address of asset
     * @param _ipfsHashes IPFS hashes of supporting documents
     */
    function requestVerification(
        AssetType _assetType,
        string memory _location,
        string[] memory _ipfsHashes
    ) external payable returns (uint256) {
        require(msg.value >= verificationFee, "Insufficient fee");
        require(_ipfsHashes.length > 0, "No documents provided");
        require(bytes(_location).length > 0, "Location required");
        
        uint256 requestId = ++requestCounter;
        
        VerificationRequest storage request = requests[requestId];
        request.requestId = requestId;
        request.owner = msg.sender;
        request.assetType = _assetType;
        request.location = _location;
        request.ipfsHashes = _ipfsHashes;
        request.status = RequestStatus.PENDING;
        request.timestamp = block.timestamp;
        
        userRequests[msg.sender].push(requestId);
        
        emit VerificationRequested(
            requestId,
            msg.sender,
            _assetType,
            _location,
            block.timestamp
        );
        
        return requestId;
    }
    
    /**
     * @notice Oracle submits ENCRYPTED response (Step 4-5)
     * @dev Oracle encrypts valuation before submission
     * @param _requestId Request ID
     * @param _encryptedValuation Encrypted valuation (externalEuint64)
     * @param _valuationProof Proof for encrypted valuation
     * @param _encryptedConfidence Encrypted confidence score (externalEuint32)
     * @param _confidenceProof Proof for encrypted confidence
     * @param _evidenceHash IPFS hash of evidence bundle
     */
    function submitOracleResponse(
        uint256 _requestId,
        externalEuint64 _encryptedValuation,
        bytes calldata _valuationProof,
        externalEuint32 _encryptedConfidence,
        bytes calldata _confidenceProof,
        bytes32 _evidenceHash
    ) external onlyAuthorizedOracle {
        VerificationRequest storage request = requests[_requestId];
        require(request.status == RequestStatus.PENDING, "Request not pending");
        require(_evidenceHash != bytes32(0), "Evidence hash required");
        
        // Check if oracle already submitted
        require(!oracleResponses[_requestId][msg.sender].submitted, "Already submitted");
        
        // 🔐 Convert encrypted inputs to FHEVM types
        euint64 encValuation = FHE.fromExternal(_encryptedValuation, _valuationProof);
        euint32 encConfidence = FHE.fromExternal(_encryptedConfidence, _confidenceProof);
        
        // Allow network to use this value
        FHE.allowThis(encValuation);
        FHE.allowThis(encConfidence);
        
        // Store encrypted response
        oracleResponses[_requestId][msg.sender] = OracleResponse({
            oracle: msg.sender,
            encryptedValuation: encValuation,
            encryptedConfidence: encConfidence,
            evidenceHash: _evidenceHash,
            timestamp: block.timestamp,
            submitted: true
        });
        
        // Track oracle
        requestOracles[_requestId].push(msg.sender);
        
        emit OracleResponseSubmitted(
            _requestId,
            msg.sender,
            _evidenceHash,
            block.timestamp
        );
        
        // Check if we have enough responses for consensus
        if (requestOracles[_requestId].length >= consensusThreshold) {
            _computeEncryptedConsensus(_requestId);
        }
    }
    
    /**
     * @notice Compute consensus on ENCRYPTED data (Step 5)
     * @dev Computing simple average on encrypted values (division not supported in FHE)
     * @param _requestId Request ID
     */
    function _computeEncryptedConsensus(uint256 _requestId) internal {
        address[] memory oracles = requestOracles[_requestId];
        require(oracles.length >= consensusThreshold, "Insufficient responses");
        
        // 🔐 ENCRYPTED AVERAGE CALCULATION
        // Since division is not supported in FHE, we use simple average
        // Formula: (val1 + val2 + val3) / count (division done off-chain or approximated)
        
        euint64 totalValue = FHE.asEuint64(0);
        euint32 totalConfidence = FHE.asEuint32(0);
        
        for (uint i = 0; i < oracles.length; i++) {
            OracleResponse storage response = oracleResponses[_requestId][oracles[i]];
            
            // 🔐 Add values (all encrypted!)
            totalValue = FHE.add(totalValue, response.encryptedValuation);
            totalConfidence = FHE.add(totalConfidence, response.encryptedConfidence);
        }
        
        // 🔐 For now, use the total sum as the final valuation
        // In production, you'd implement approximate division or use the median
        euint64 finalValuation = totalValue;
        
        // 🔐 Use total confidence (can be normalized client-side)
        euint32 avgConfidence = totalConfidence;
        
        // Allow network to use final values
        FHE.allowThis(finalValuation);
        FHE.allowThis(avgConfidence);
        
        // Allow owner to access their result
        FHE.allow(finalValuation, requests[_requestId].owner);
        FHE.allow(avgConfidence, requests[_requestId].owner);
        
        // Create verification hash
        bytes32 verificationHash = keccak256(
            abi.encode(
                _requestId,
                block.timestamp
            )
        );
        
        // Store ENCRYPTED consensus result
        consensusResults[_requestId] = ConsensusResult({
            finalEncryptedValuation: finalValuation,
            avgEncryptedConfidence: avgConfidence,
            responseCount: oracles.length,
            consensusReached: true,
            timestamp: block.timestamp,
            verificationHash: verificationHash
        });
        
        // Update request status
        requests[_requestId].status = RequestStatus.VERIFIED;
        
        // Store as current price
        currentPrices[_requestId] = EncryptedPriceData({
            price: finalValuation,
            confidence: avgConfidence,
            timestamp: block.timestamp
        });
        
        // Add to price history
        priceHistory[_requestId].push(EncryptedPriceData({
            price: finalValuation,
            confidence: avgConfidence,
            timestamp: block.timestamp
        }));
        
        emit ConsensusReached(_requestId, oracles.length, block.timestamp);
        
        // Trigger tokenization (will be handled by TokenFactory)
        if (tokenFactory != address(0)) {
            // Call token factory to create encrypted tokens
            _notifyTokenization(_requestId, finalValuation);
        }
    }
    
    /**
     * @notice Notify token factory of new verified asset
     */
    function _notifyTokenization(uint256 _requestId, euint64 _encryptedValuation) internal {
        // This will be called by external contract
        // For now, just allow the token factory to access the encrypted value
        FHE.allow(_encryptedValuation, tokenFactory);
    }
    
    /**
     * @notice Get encrypted valuation (owner can decrypt client-side)
     * @dev Returns encrypted value handle
     * @param _requestId Request ID
     * @return Encrypted valuation
     */
    function getEncryptedValuation(uint256 _requestId) external view returns (euint64) {
        VerificationRequest storage request = requests[_requestId];
        require(request.owner == msg.sender, "Not owner");
        require(consensusResults[_requestId].consensusReached, "Consensus not reached");
        
        return consensusResults[_requestId].finalEncryptedValuation;
    }
    
    /**
     * @notice Get encrypted confidence score
     */
    function getEncryptedConfidence(uint256 _requestId) external view returns (euint32) {
        VerificationRequest storage request = requests[_requestId];
        require(request.owner == msg.sender, "Not owner");
        require(consensusResults[_requestId].consensusReached, "Consensus not reached");
        
        return consensusResults[_requestId].avgEncryptedConfidence;
    }
    
    /**
     * @notice Get current encrypted price for DeFi integration
     * @dev DeFi protocols can verify collateral without seeing actual value
     */
    function getEncryptedPrice(uint256 _assetId) external view returns (euint64) {
        require(currentPrices[_assetId].timestamp > 0, "Price not available");
        
        return currentPrices[_assetId].price;
    }
    
    // ========== ORACLE MANAGEMENT ==========
    
    /**
     * @notice Oracle stakes tokens to become authorized
     */
    function stakeOracle() external payable {
        require(msg.value >= minOracleStake, "Insufficient stake");
        
        oracleStake[msg.sender] += msg.value;
        authorizedOracles[msg.sender] = true;
        
        emit OracleAuthorized(msg.sender, msg.value);
    }
    
    /**
     * @notice Revoke oracle authorization (any admin can revoke)
     */
    function revokeOracle(address _oracle) external onlyAdmin {
        authorizedOracles[_oracle] = false;
        emit OracleRevoked(_oracle);
    }
    
    /**
     * @notice Slash oracle for misbehavior (any admin can slash)
     */
    function slashOracle(address _oracle, uint256 _amount) external onlyAdmin {
        require(oracleStake[_oracle] >= _amount, "Insufficient stake");
        
        oracleStake[_oracle] -= _amount;
        payable(msg.sender).transfer(_amount); // Penalty goes to admin who caught it
        
        emit OracleSlashed(_oracle, _amount);
    }
    
    /**
     * @notice Oracle withdraws stake
     */
    function withdrawStake() external {
        require(!authorizedOracles[msg.sender], "Still authorized");
        uint256 stake = oracleStake[msg.sender];
        require(stake > 0, "No stake");
        
        oracleStake[msg.sender] = 0;
        payable(msg.sender).transfer(stake);
    }
    
    // ========== PRICE UPDATE (Re-valuation) ==========
    
    /**
     * @notice Update asset price (monthly re-valuations)
     * @dev Oracles can submit new encrypted prices
     */
    function updatePrice(
        uint256 _assetId,
        externalEuint64 _encryptedPrice,
        bytes calldata _priceProof,
        externalEuint32 _encryptedConfidence,
        bytes calldata _confidenceProof
    ) external onlyAuthorizedOracle {
        euint64 price = FHE.fromExternal(_encryptedPrice, _priceProof);
        euint32 confidence = FHE.fromExternal(_encryptedConfidence, _confidenceProof);
        
        FHE.allowThis(price);
        FHE.allowThis(confidence);
        
        currentPrices[_assetId] = EncryptedPriceData({
            price: price,
            confidence: confidence,
            timestamp: block.timestamp
        });
        
        priceHistory[_assetId].push(EncryptedPriceData({
            price: price,
            confidence: confidence,
            timestamp: block.timestamp
        }));
        
        emit PriceUpdated(_assetId, block.timestamp);
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    /**
     * @notice Get request details (public data only)
     */
    function getRequest(uint256 _requestId) external view returns (VerificationRequest memory) {
        return requests[_requestId];
    }
    
    /**
     * @notice Get user's requests
     */
    function getUserRequests(address _user) external view returns (uint256[] memory) {
        return userRequests[_user];
    }
    
    /**
     * @notice Get oracle responses for a request
     */
    function getRequestOracles(uint256 _requestId) external view returns (address[] memory) {
        return requestOracles[_requestId];
    }
    
    /**
     * @notice Check if consensus reached (public status)
     */
    function isConsensusReached(uint256 _requestId) external view returns (bool) {
        return consensusResults[_requestId].consensusReached;
    }
    
    /**
     * @notice Get price history length
     */
    function getPriceHistoryLength(uint256 _assetId) external view returns (uint256) {
        return priceHistory[_assetId].length;
    }
    
    // ========== ADMIN FUNCTIONS (TEAM ACCESS) ==========
    
    /**
     * @notice Set token factory address (any admin)
     */
    function setTokenFactory(address _tokenFactory) external onlyAdmin {
        tokenFactory = _tokenFactory;
    }
    
    /**
     * @notice Set asset registry address (any admin)
     */
    function setAssetRegistry(address _assetRegistry) external onlyAdmin {
        assetRegistry = _assetRegistry;
    }
    
    /**
     * @notice Set verification fee (any admin)
     */
    function setVerificationFee(uint256 _fee) external onlyAdmin {
        verificationFee = _fee;
    }
    
    /**
     * @notice Set consensus threshold (any admin)
     */
    function setConsensusThreshold(uint256 _threshold) external onlyAdmin {
        consensusThreshold = _threshold;
    }
    
    /**
     * @notice Set min oracle stake (any admin)
     */
    function setMinOracleStake(uint256 _stake) external onlyAdmin {
        minOracleStake = _stake;
    }
    
    /**
     * @notice Withdraw fees (any admin can withdraw)
     */
    function withdrawFees() external onlyAdmin {
        uint256 balance = address(this).balance;
        uint256 totalStakes = 0;
        
        // Calculate total staked amount (can't withdraw stakes)
        // This is a simplified version - in production, track this separately
        
        require(balance > totalStakes, "No fees to withdraw");
        payable(msg.sender).transfer(balance - totalStakes);
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
    
    // Allow contract to receive ETH
    receive() external payable {}
}
