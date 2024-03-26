# Running the Taiko Prover in a Gevulot node

This readme will guide you through the steps necesary to run the Taiko prover on Gevulot.


## 1 The Witness

We will first need a witness for the proof.  There are three steps here:
- download a random witness
- rename it to a unique name
- upload to http server


### 1.1  Download a ransom witness

There are 58 different Taiko witneeses located here, numbers 46800-46857

```
https://gevulot-test.eu-central-1.linodeobjects.com/witness-46800.json
```

Choose one at random, and download.


If you'd like a genuinely random number, [this link](https://www.random.org/integers/?num=1&min=46800&max=46857&col=5&base=10&format=html&rnd=new) will generate a number in the given range.  Just plug the number into the url above and download the file.

### 1.2  Rename the file

Now, rename the file to something unique.  The proof request transaction results in a hash of the inputs.  It is best to have a unique unique hash of the transation., otherwise your proof quest may have already results attached to 

### 1.3 Calculate the hash

For this step, you will need to have build `gevulot-cli` and have it in your path.  Call it with the `calculate-hash` action, and pass in the witness file.

gevulot-cli calculate-hash --file  ~/Downloads/mynewwitness-46807.json
The hash of the file is: 77263b62caae635536c7fefe99e249c55dec5625fecdb550cf83c26108e3f03a


### 1.4  Upload to a public http server

Lastly, you will need a public url for for the file.  An S3 bucket would be one option.  Just make sure the file has public read permissions.

## 2 Execute the proof

### 2.1  The params stucture for the proof


Use the json structure below as a template for creating the parameter inputs.  You will observe:
- five arguments are passed in as key/value pairs
- two folders used
  - the `/gevulot` path is used for static files embedded in the prover image.  In this case, there is one, a 512MB proof parameters files, with degree k = 22.
  - the `/workspace` path is used for dynamic file instances
- one input files is passed in, namely out witness.  Edit urls and hash values, the latter associated with the `local_path` property.
- the output proof from the prover is referenced as an input into the verifier.

You will have to edit the witness file in three place
- the argument list, for the `-w` parameter
- the `vm-path` property
- the `file_url` property


```
[
    {
        "program": "b79c111360acfefd01f240c0d4942e25f855a1fd25278026ecc76730f82a75da",
        "cmd_args": [
            {
                "name": "-k",
                "value": "/gevulot/kzg_bn254_22.srs"
            },
            {
                "name": "-p",
                "value": "/workspace/proof.json"
            },
            {
                "name": "-w",
                "value": "/workspace/mynewwitness-46807.json"
            }
        ],
        "inputs": [
            {
                "Input": {
                    "local_path": "77263b62caae635536c7fefe99e249c55dec5625fecdb550cf83c26108e3f03a",
                    "vm_path": "/workspace/mynewwitness-46807.json",
                    "file_url": "https://gevulot-test.eu-central-1.linodeobjects.com/mynewwitness-46807.json"
                }
            }
        ]
    },
    {
        "program": "371d815c6ce9ba7a04bf9452207bcb2a1dcf0818c93c949a186bca8734393872",
        "cmd_args": [
            {
                "name": "-p",
                "value": "/workspace/proof.json"
            }
        ],
        "inputs": [
            {
                "Output": {
                    "source_program": "b79c111360acfefd01f240c0d4942e25f855a1fd25278026ecc76730f82a75da",
                    "file_name": "/workspace/proof.json"
                }
            }
        ]
    }
]
```

Note: the program hashes are static, corresponding to the currently deployed instances of the prover and verifier.

```
Taiko Prover hash: b79c111360acfefd01f240c0d4942e25f855a1fd25278026ecc76730f82a75da
Taiko Verifier hash: 371d815c6ce9ba7a04bf9452207bcb2a1dcf0818c93c949a186bca8734393872
```

### 3.2  Execute the proof

We then embed the json struct (with whitespace removed) in a command line call to `gevulot-cli`, using the `exec` action.


```
./target/release/gevulot-cli --jsonurl http://api.devnet.gevulot.com:9944  exec --tasks '[{"program":"b79c111360acfefd01f240c0d4942e25f855a1fd25278026ecc76730f82a75da","cmd_args":[{"name":"-k","value":"/gevulot/kzg_bn254_22.srs"},{"name":"-p","value":"/workspace/proof.json"},{"name":"-w","value":"/workspace/mynewwitness-46807.json"}],"inputs":[{"Input":{"local_path":"77263b62caae635536c7fefe99e249c55dec5625fecdb550cf83c26108e3f03a","vm_path":"/workspace/mynewwitness-46807.json","file_url":"https://gevulot-test.eu-central-1.linodeobjects.com/mynewwitness-46807.json"}}]},{"program":"371d815c6ce9ba7a04bf9452207bcb2a1dcf0818c93c949a186bca8734393872","cmd_args":[{"name":"-p","value":"/workspace/proof.json"}],"inputs":[{"Output":{"source_program":"b79c111360acfefd01f240c0d4942e25f855a1fd25278026ecc76730f82a75da","file_name":"/workspace/proof.json"}}]}]'

```

You will get back a transaction hash, e.g:

```
Programs send to execution correctly. Tx hash:e462679e6d3345d76005ee42301e01065db688e080c10adb2648ad645c77d1a5
```


## 3. Verify the results

Use the transaction hash to get the verifier output.

### 3.1 View the transaction

First, you can query the transaction itself, by calling `gevulot-cli` with the `get-tx` action and the hash.  It will return the parameters passed into the `exec` call, along with some additional metadata.

```
./target/release/gevulot-cli --jsonurl http://api.devnet.gevulot.com:9944 get-tx e462679e6d3345d76005ee42301e01065db688e080c10adb2648ad645c77d1a5
```
### 3.2 View the transaction tree

Now, print out the transaction tree using the `print-tx-tree` action and the txhash you got back from the `exec` call.


```
./target/release/gevulot-cli --jsonurl http://api.devnet.gevulot.com:9944 print-tx-tree e462679e6d3345d76005ee42301e01065db688e080c10adb2648ad645c77d1a5 

```
In the case of this prover, it can typically take 6-7 minutes.  Until then, no tree will be found

```
An error while fetching transaction tree: RPC response error:not found: no root tx found for e462679e6d3345d76005ee42301e01065db688e080c10adb2648ad645c77d1a5
```


When the proof completes, you will see a tree like this
```
Root: e462679e6d3345d76005ee42301e01065db688e080c10adb2648ad645c77d1a5
        Node: 53ee422a8122b7ffd721ad59464ad114215dbcce061aeb91b293ca462df64cc3
                Leaf: 267a086104427813a2474bd9aef65a721719f2d7dec24a673e3bdce6982490ad
                Leaf: dd6ec406e8ea156e8b9a16dfee38e1ba39e15c22ffaad3586dd746510a8c186f
                Leaf: 8f655cfc476dc57182dbc0fd21e7d51bc9d8720bdcb4326dde2ae7ebe1bde758
```



### 3.3 Examine a leaf

You may see several Leaf entries.  Choose the first, and do a `get-tx` on it to print out the verifier results.


```
./target/release/gevulot-cli --jsonurl http://api.devnet.gevulot.com:9944 get-tx 267a086104427813a2474bd9aef65a721719f2d7dec24a673e3bdce6982490ad

{"author":"041a0b9bdd6a7a94df9a0d5d0c76c7d990e50e38f1b0ab33bbc97a057776b31302391998c692c2afd13ea683cbff2827ce72a2e7d0f91147654e21f0df3d8b34c2","hash":"267a086104427813a2474bd9aef65a721719f2d7dec24a673e3bdce6982490ad","payload":{"Verification":{"parent":"53ee422a8122b7ffd721ad59464ad114215dbcce061aeb91b293ca462df64cc3","verifier":"371d815c6ce9ba7a04bf9452207bcb2a1dcf0818c93c949a186bca8734393872","verification":"eyJpc19zdWNjZXNzIjp0cnVlLCJtZXNzYWdlIjoiVGFpa28gdmVyaWZpZXIgcmVzdWx0OiBzdWNjZXNzIiwicHJvb2ZfZmlsZSI6Ii93b3Jrc3BhY2UvcHJvb2YuanNvbiIsInRpbWVzdGFtcCI6MTcxMTQ0NTQzOTAxMn0=","files":[]}},"nonce":0,"signature":"faa5372dd579d2050e2bd085d424fca5c6ebdd78cdabdbb34d4af5bb4c06c2a0714cec9d26141a9d195828fc8d8833966844aecb0aafa22c0d02648dca52eac4"} 
```


### 3.4 Parse the verification result

Under payload.Verification.verification, we see a string encoded as base64. Use `jq` plus `base64` to decode that at the command line.  Now we can read the json text generated by the verifier.

```
./target/release/gevulot-cli --jsonurl http://api.devnet.gevulot.com:9944 get-tx 267a086104427813a2474bd9aef65a721719f2d7dec24a673e3bdce6982490ad  | jq -r '.payload.Verification.verification' | base64 -d

{"is_success":true,"message":"Taiko verifier result: success","proof_file":"/workspace/proof.json","timestamp":1711445439012}
```

