const { init } = require('z3-solver');
async function main() {
    const { Context } = await init();
    const z3 = new Context('main');
    const v1 = z3.BitVec.val(64, 256);
    const v2 = z3.BitVec.val(32, 256);
    const sum = v1.add(v2);
    console.log("sum isBitVecVal:", z3.isBitVecVal(sum));
    
    const simp = sum.simplify();
    console.log("simp isBitVecVal:", z3.isBitVecVal(simp));
    if (z3.isBitVecVal(simp)) {
        console.log("simp value:", simp.value());
    }
}
main();
