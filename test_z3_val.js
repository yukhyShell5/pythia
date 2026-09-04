const { init } = require('z3-solver');
async function main() {
    const { Context } = await init();
    const z3 = new Context('main');
    const val = z3.BitVec.val(64, 256);
    console.log("isConst:", val.isConst);
    console.log("isBitVecVal:", z3.isBitVecVal(val));
    console.log("value:", val.value ? val.value() : "no value()");
    // try to get BigInt
    console.log("as string:", val.toString());
}
main();
