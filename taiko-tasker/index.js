var ethers = require('ethers');
require('dotenv').config();
const AWS = require('aws-sdk')
const fs = require('fs')

var firstBlock = 440000;
if (process.argv.length == 3) {
    firstBlock = process.argv[2];
}

console.log('firstBlock is ', firstBlock);

// var customHttpProvider = new ethers.JsonRpcProvider(process.env.KATLA_ENDPOINT);

var s3 = new AWS.S3({
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    sslEnabled: true,
  })

const util = require('util');
const { exit } = require('process');
const exec = util.promisify(require('child_process').exec);

async function uploadFile(srcName, dstName) {
    const fileContent = fs.readFileSync(srcName)
  
    let acl = 'public-read'
    const params = {
      Bucket: 'gevulot-test',
      Key: dstName,
      ACL: acl,
      Body: fileContent,
    }
    let res = await s3.upload(params).promise();
    console.log('res: ', res);
    return res.Location;
  }

async function callProverCmdCapture(blockNumber) {
    console.log('callProverCmdCapture ', blockNumber)
    let cmd = `${process.env.PROVER_CMD_PATH} witness_capture -b ${blockNumber} -k ${process.env.PARAMS_PATH} -r ${process.env.KATLA_ENDPOINT} -w witnesses/witness-${blockNumber}.json`
    console.log('  cmd: ', cmd);

    const { stdout, stderr } = await exec(cmd);
    console.log('  stdout:', stdout);
    console.log('  stderr:', stderr);
}

function getRandomWitness() {
    let n = 441000 + Math.floor(Math.random() * 243);
    console.log('n = ', n);
    return n
  }

async function cloneRandomWitness(blockNumber) {
    console.log('cloneRandomWitness ', blockNumber)
    let n = getRandomWitness();
    let in_path = `./witnesses/witness-${n}.json`;
    let out_path = `./witnesses/witness-${blockNumber}.json`;
    console.log('in_path = ', in_path)
    console.log('out_path = ', out_path)
    const fileContent = fs.readFileSync(in_path);
    console.log('fileContent len = ', fileContent.length)
    let res = fs.writeFileSync(out_path, fileContent);
}


async function calculateChecksum(blockNumber) {
    console.log('calculateChecksum ', blockNumber)
    let cmd = `${process.env.GEVULOT_CLI} --jsonurl ${process.env.GEVULOT_JSONURL}  calculate-hash --file witnesses/witness-${blockNumber}.json`
    console.log('  cmd: ', cmd);
    const { stdout, stderr } = await exec(cmd);
    console.log('stdout:', stdout);
    let res = stdout.match(/(?<=: ).*$/gm);
    console.log('res:', res);
    return res[0];
}

async function captureWitness(blockNumber) {
    console.log("captureWitness ", blockNumber)
    // await callProverCmdCapture(blockNumber)
    // return;
    await cloneRandomWitness(blockNumber)
    let witness_checksum = await calculateChecksum(blockNumber)
    console.log('  got checksum: ', witness_checksum);
    let witness_name = `witness-${blockNumber}.json`
    let srcName = `witnesses/${witness_name}`
    let witness_url = await uploadFile(srcName, witness_name);
    return {witness_checksum, witness_name, witness_url};
}

async function executeProof(witness_checksum, witness_name, witness_url) {
    console.log('executeProof ')

    let params = 
    [
        {
            program: process.env.PROVER_HASH,
            cmd_args: [
                {
                    name:"-k",
                    value: process.env.PARAMS_PATH
                },
                {
                    name:"-p",
                    value:"/workspace/proof.json"
                },
                {
                    name:"-w",
                    value: `/workspace/${witness_name}`
                }
            ],
            inputs: [
                {
                    Input: {
                        local_path: witness_checksum,
                        vm_path: `/workspace/${witness_name}`, 
                        file_url: witness_url
                    }
                }
            ]
        },
        {
            program: process.env.VERIFIER_HASH,
            cmd_args: [
                {
                    name:"-p",
                    value:"/workspace/proof.json"
                }
            ],
            inputs: [
                {
                    Output: {
                        source_program: process.env.PROVER_HASH,
                        file_name:"/workspace/proof.json"
                    }
                }
            ]
        }
    ]
    let params_str = JSON.stringify(params);

    let cmd = `${process.env.GEVULOT_CLI} --jsonurl ${process.env.GEVULOT_JSONURL}  exec --tasks '${params_str}'`
    console.log('  cmd: ', cmd);

    const { stdout, stderr } = await exec(cmd);
    console.log('stdout:', stdout);
    console.log('stderr:', stderr);
    let res = stdout.match(/(?<=Tx hash:).*$/gm);
    console.log('res:', res);
    return res[0];
}

async function getTxLeaf(txhash) {
    var cmd = `${process.env.GEVULOT_CLI} --jsonurl ${process.env.GEVULOT_JSONURL} print-tx-tree ${txhash}`
    var { stdout, stderr } = await exec(cmd);
    // console.log('getTxLeaf stdout: ', stdout);
    if (stdout.indexOf('Leaf') > 0) {
        console.log("have Leaf");
        let res = stdout.match(/(?<=Leaf: ).*$/gm);
        console.log("res: ", res);
        return res[0]
    }
}


async function getVerifierResult(txhash) {
    let leaf = await getTxLeaf(txhash);
    if (!leaf) return leaf;
    console.log('got leaf back: ', leaf)
    var cmd = `${process.env.GEVULOT_CLI} --jsonurl ${process.env.GEVULOT_JSONURL} get-tx ${leaf} | jq -r '.payload.Verification.verification' | base64 -d`
    console.log('cmd: ', cmd)

    var { stdout, stderr } = await exec(cmd);
    console.log('stdout: ', stdout)
    return stdout;
}

async function writeVerifierResult(verifier_result, filepath) {
    let res = fs.writeFileSync(filepath, verifier_result);
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function doBlock(blockNumber) {
    console.log("doBlock ", blockNumber)
    let {witness_checksum, witness_name, witness_url} = await captureWitness(blockNumber)
    // await captureWitness(blockNumber)
    // return;
    console.log("witness_checksum ", witness_checksum)
    console.log("witness_name ", witness_name)
    console.log("witness_url ", witness_url)
    console.log(`--${witness_checksum}-- len ${witness_checksum.length}`)
    let txhash = await executeProof(witness_checksum, witness_name, witness_url);
    let start = Date.now()
    while (true) {
        let verifier_result = await getVerifierResult(txhash);
        if (verifier_result) {
            console.log('got verifier result, length: ', verifier_result.length);
            console.log(verifier_result)
            let filepath = `results/result-${blockNumber}`;
            if (verifier_result[0] == '{') {
                await writeVerifierResult(verifier_result, filepath);
            } else {
                console.log('unexpected result, going to next witness');
                await writeVerifierResult('unexpected result', filepath);
            }
            console.log('written to ', filepath);
            return;
        } else {
            let secs = Date.now() - start;
            console.log(`wait 10 seconds ${secs/1000} sec`);
        }
        await sleep(10 * 1000);
    }
}

async function getLatestBlockNumber() {
    console.log('getLatestBlockNumber')
    let res = await customHttpProvider.getBlockNumber();
    return res;
}



async function main() {
    let blockNumber = firstBlock;
    while (true) {
        // let blockNumber = await getLatestBlockNumber()
        await doBlock(blockNumber)
        blockNumber++;
    }
}


main()

