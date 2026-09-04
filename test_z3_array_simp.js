const { init } = require('z3-solver');
async function main() {
    const { Context } = await init();
    const z3 = new Context('main');
    const bv256Sort = z3.BitVec.sort(256);
    let mem = z3.Array.K(bv256Sort, z3.BitVec.val(0, 256));
    
    // Write 100 times
    for (let i = 0; i < 100; i++) {
        mem = mem.store(z3.BitVec.val(i, 256), z3.BitVec.val(i * 2, 256));
    }
    
    console.log("Before simplify, length of string:", mem.toString().length);
    let simp = await z3.simplify(mem);
    console.log("After simplify, length of string:", simp.toString().length);
}
main();
