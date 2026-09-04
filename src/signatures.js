const https = require('https');

// Dictionnaire local des signatures les plus communes (ERC20, ERC721, ERC1155, AccessControl, etc.)
// Cela évite de spammer l'API 4byte pour les fonctions standards.
const LOCAL_SIGNATURES = {
    "0x06fdde03": "name()",
    "0x313ce567": "decimals()",
    "0x95d89b41": "symbol()",
    "0x18160ddd": "totalSupply()",
    "0x70a08231": "balanceOf(address)",
    "0xa9059cbb": "transfer(address,uint256)",
    "0xdd62ed3e": "allowance(address,address)",
    "0x095ea7b3": "approve(address,uint256)",
    "0x23b872dd": "transferFrom(address,address,uint256)",
    "0x28ed4f6c": "setApprovalForAll(address,bool)",
    "0xe985e9c5": "isApprovedForAll(address,address)",
    "0x081812fc": "getApproved(uint256)",
    "0x42842e0e": "safeTransferFrom(address,address,uint256)",
    "0xb88d4fde": "safeTransferFrom(address,address,uint256,bytes)",
    "0x6352211e": "ownerOf(uint256)",
    "0x8da5cb5b": "owner()",
    "0x715018a6": "renounceOwnership()",
    "0xf2fde38b": "transferOwnership(address)",
    "0x3659cfe6": "upgradeTo(address)",
    "0x4f1ef286": "upgradeToAndCall(address,bytes)",
    "0x5c60da1b": "implementation()",
    "0x893d20e8": "getOwner()",
    "0x01ffc9a7": "supportsInterface(bytes4)",
    "0x3644e515": "DOMAIN_SEPARATOR()",
    "0x3eaaf86b": "totalSupply()", // Some contracts use this alternative
    "0x91d14854": "admin()",
    "0xd3365118": "mint(address,uint256)",
    "0x40c10f19": "mint(address,uint256)",
    "0x42966c68": "burn(uint256)"
};

// Cache en mémoire pour éviter les requêtes HTTP répétées pendant l'exécution
const cache = new Map();

/**
 * Tente de résoudre une signature 4-bytes (ex: "0xa9059cbb").
 * Cherche d'abord en local, puis fait un fallback sur l'API 4byte.directory.
 * @param {string} hexSignature 
 * @returns {Promise<string|null>}
 */
async function resolveSignature(hexSignature) {
    hexSignature = hexSignature.toLowerCase();
    if (!hexSignature.startsWith("0x")) {
        hexSignature = "0x" + hexSignature;
    }

    // 1. Local bruteforce / dictionary
    if (LOCAL_SIGNATURES[hexSignature]) {
        return LOCAL_SIGNATURES[hexSignature];
    }

    // 2. Memory cache
    if (cache.has(hexSignature)) {
        return cache.get(hexSignature);
    }

    // 3. Fallback to 4byte.directory API
    return new Promise((resolve) => {
        const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${hexSignature}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.results && parsed.results.length > 0) {
                        // On prend le résultat le plus ancien/standard
                        const textSignature = parsed.results[parsed.results.length - 1].text_signature;
                        cache.set(hexSignature, textSignature);
                        resolve(textSignature);
                    } else {
                        cache.set(hexSignature, null);
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => {
            // Ignorer silencieusement les erreurs réseau (ex: pas de connexion)
            resolve(null);
        });
    });
}

module.exports = {
    resolveSignature,
    LOCAL_SIGNATURES
};
