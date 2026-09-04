# Roadmap : Pythia (EVM Symbolic Execution & CFG)

## Stratégie de Branches (Git)
 
Pour gérer la coexistence de la version Node.js (conçue comme un package intégrable) et de la réécriture performante en Go, voici la stratégie de versioning recommandée :

*   **`branch: node-pkg`** : Hébergera la version actuelle en Node.js. L'objectif est d'appliquer les correctifs pour qu'elle puisse être intégrée facilement comme dépendance dans d'autres outils orientés JS/TS.
*   **`branch: go-core`** : Hébergera le nouveau développement du moteur de zéro en langage Go, pour des performances optimales.
*   **`branch: main`** : Cette branche pointe toujours sur la version "officielle" prête pour la production. Tant que la réécriture en Go n'est pas finalisée, `main` contient la version Node.js. Une fois la version Go terminée et stable, elle écrasera et fusionnera dans `main` pour devenir l'outil principal. L'ancienne version Node.js sera alors exclusivement maintenue sur la branche `node-pkg`.

---

## Roadmap : Version Node.js

Cette roadmap détaille les prochaines étapes de développement pour la branche Node.js, organisées de manière séquentielle et par ordre de priorité.

### Phase 1 : Correctifs Critiques (Stabilité & Exactitude)
*Ces éléments doivent être réalisés en priorité pour assurer le bon fonctionnement du moteur actuel.*

| Statut | Étape | Description |
| :---: | :--- | :--- |
| 🔲 | **1.1 Path Conditions (Explosion des chemins)** | Corriger l'évaluation des `JUMPI`. Stocker les contraintes de chemin (`pathConstraints`) dans l'état et les injecter dans le solveur Z3 lors du forking pour éviter d'explorer des chemins mathématiquement impossibles. |
| 🔲 | **1.2 Vraie gestion Mémoire & Storage** | Remplacer les simples `Map` Javascript par de véritables objets `Z3.Array`. Cela permettra à Z3 de comprendre formellement les liens entre les lectures (`SLOAD`/`MLOAD`) et les écritures (`SSTORE`/`MSTORE`). |

### Phase 2 : Améliorations Simples
*Mise à niveau de l'outil pour supporter les contrats récents et améliorer l'expérience utilisateur.*

| Statut | Étape | Description |
| :---: | :--- | :--- |
| 🔲 | **2.1 Mises à jour EVM (Shanghai & Cancun)** | Intégrer le support des opcodes récents manquants : `TSTORE` (0x5c), `TLOAD` (0x5d), `MCOPY` (0x5e), `BLOBHASH`, `BLOBBASEFEE` et `PUSH0` (0x5f). |
| 🔲 | **2.2 Signatures de fonctions automatiques** | Détecter les comparaisons de dispatch (`EQ` avec `calldata`) et interroger une base de données de signatures (ex: 4byte.directory) pour nommer intelligemment les branches du graphe. |

### Phase 3 : Améliorations Complexes (Décompilation)
*Transformation du CFG bas-niveau en représentations compréhensibles.*

| Statut | Étape | Description |
| :---: | :--- | :--- |
| 🔲 | **3.1 Décompilation vers ABI** | Analyser le Dispatcher et les flux d'entrées/sorties pour inférer et générer automatiquement une ABI propre (fonctions, arguments, types de retour). |
| 🔲 | **3.2 Décompilation vers Yul** | Créer un processus d'analyse du CFG pour regrouper les blocs de base, reconstruire les structures de contrôle avancées et générer un code source Yul ou pseudo-Solidity lisible. |

---

## ⚠️ PÉRIMÈTRE DU PROJET (Vérifications & Audit)

**La détection de vulnérabilités (Reentrancy, Integer Overflow, etc.) ne sera PAS gérée par cet outil.**

La philosophie est de garder l'architecture modulaire :
*   **`cfg-evm`** se limite exclusivement à la génération du graphe (CFG), la décompilation, et la résolution de l'exécution symbolique.
*   Les règles d'analyse statique et la détection d'exploits seront prises en charge par un autre projet indépendant, nommé **`cfg-ql`** (situé dans le répertoire parent `../cfg-ql`).
