const { expect } = require("chai");
const fs = require('fs');
const CIDTool = require('cid-tool')

async function deploy(name) {
    const Cid = await ethers.getContractFactory("Cid");
    const cid = await Cid.deploy();

    const Contract = await ethers.getContractFactory(name, {
        libraries: {
            Cid: cid.address,
        },
    });
    return await Contract.deploy().then(f => f.deployed());
}

describe("Aggregator Tests", function () {

    before(async function() {
        this.dealstatus = await deploy('DealStatusMock');
    });

    describe("Validate Aggregator", function() {
        it("Should submit a valid request", async function() { 
            cid = "0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127";
            await expect(this.dealstatus.submit(cid)).to.emit(this.dealstatus, "SubmitAggregatorRequest").withArgs(1, cid);
        });

        it("Should submit a callback with the expected Aux Data", async function () {
            verifData = {
                commPc: "0x0181e2039220200d0e0a0100030000000000000000000000000000000000000000000000000000",
                sizePc: 0x20000000,
            }
            incProof = {
                proofSubtree: {
                    index: 0x5,
                    path: [
                        "0x0d0e0a0100020000000000000000000000000000000000000000000000000000",
                        "0x0d0e0a0100040000000000000000000000000000000000000000000000000000",
                        "0xb6a5c5d0cbaabd7e63de256c819d84623fde6f53d616120508667b12659f7c3e",
                        "0x2df9cf74cb24e6349b809399b3a046640219dce8b97954eec43bf605dcc59b2d",
                        "0xd8610218425ab5e95b1ca6239d29a2e420d706a96f373e2f9c9a91d759d19b01",
                        "0xd628c4e101d5ca9aa4b341e4d0f028be8636fd7a0c3bf691cef16113b8d97932",
                    ],
                },

                proofIndex: {
                    index: 0x1ffc0003,
                    path: [
                        "0xca99a41370d2dd04f7d97b0fed8a9833031291a6f7c825d7245b428fef8b2734",
                        "0x2bc4f6cafd6a8366d032dfc7fceefd0ff2fb34dd2ea910da454773057333dd2a",
                        "0x578b81a6596624f326b1d31e2e3db91062545d2f819d605cc4afef3377151800",
                        "0x0e067c9486c9d41ff6cfeaf2d4b330d432e6aefa18eacbb5ce072ca197760215",
                        "0x1f7ac9595510e09ea41c460b176430bb322cd6fb412ec57cb17d989a4310372f",
                        "0xfc7e928296e516faade986b28f92d44a4f24b935485223376a799027bc18f833",
                        "0x08c47b38ee13bc43f41b915c0eed9911a26086b3ed62401bf9d58b8d19dff624",
                        "0xb2e47bfb11facd941f62af5c750f3ea5cc4df517d5c4f16db2b4d77baec1a32f",
                        "0xf9226160c8f927bfdcc418cdf203493146008eaefb7d02194d5e548189005108",
                        "0x2c1a964bb90b59ebfe0f6da29ad65ae3e417724a8f7c11745a40cac1e5e74011",
                        "0xfee378cef16404b199ede0b13e11b624ff9d784fbbed878d83297e795e024f02",
                        "0x8e9e2403fa884cf6237f60df25f83ee40dca9ed879eb6f6352d15084f5ad0d3f",
                        "0x752d9693fa167524395476e317a98580f00947afb7a30540d625a9291cc12a07",
                        "0x7022f60f7ef6adfa17117a52619e30cea82c68075adf1c667786ec506eef2d19",
                        "0xd99887b973573a96e11393645236c17b1f4c7034d723c7a99f709bb4da61162b",
                        "0xd0b530dbb0b4f25c5d2f2a28dfee808b53412a02931f18c499f5a254086b1326",
                        "0x84c0421ba0685a01bf795a2344064fe424bd52a9d24377b394ff4c4b4568e811",
                        "0x65f29e5d98d246c38b388cfc06db1f6b021303c5a289000bdce832a9c3ec421c",
                        "0xa2247508285850965b7e334b3127b0c042b1d046dc54402137627cd8799ce13a",
                        "0xdafdab6da9364453c26d33726b9fefe343be8f81649ec009aad3faff50617508",
                        "0xd941d5e0d6314a995c33ffbd4fbe69118d73d4e5fd2cd31f0f7c86ebdd14e706",
                        "0x514c435c3d04d349a5365fbd59ffc713629111785991c1a3c53af22079741a2f",
                        "0xad06853969d37d34ff08e09f56930a4ad19a89def60cbfee7e1d3381c1e71c37",
                        "0x39560e7b13a93b07a243fd2720ffa7cb3e1d2e505ab3629e79f46313512cda06",
                        "0xccc3c012f5b05e811a2bbfdd0f6833b84275b47bf229c0052a82484f3c1a5b3d",
                        "0x7df29b69773199e8f2b40b77919d048509eed768e2c7297b1f1437034fc3c62c",
                        "0x66ce05a3667552cf45c02bcc4e8392919bdeac35de2ff56271848e9f7b675107",
                        "0xd8610218425ab5e95b1ca6239d29a2e420d706a96f373e2f9c9a91d759d19b01",
                        "0xd0eef6d1bccabc5b5b9e3af2fea8ea9d184f08f43ac2071bdc635d44bbe35115",
                    ],
                },
            }
            expectedAux = {
                commPa: "0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127",
                sizePa: 0x800000000
            }
            await expect(this.dealstatus.complete(1, 1234, 4321, incProof, verifData)).to.emit(this.dealstatus, "CompleteAggregatorRequest").withArgs(1, 1234);

            /*
            const newAux = await this.dealstatus.complete(1, 1234, incProof, verifData);
            console.log(newAux);
            expect(newAux.data.commPa).to.equal(expectedAux.commPa);
            expect(newAux.data.sizePa).to.equal(expectedAux.sizePa);
            */
        });

        
        function ipfsCidToHex(ipfsCid) {
            rval = CIDTool.format(ipfsCid, { base: 'base16' })
            return rval.substr(1, rval.length - 1);
        }

        it("Should return all dealIDs created by the aggregator", async function() {
            verifData = {
                commPc: "0x0181e2039220200d0e0a0100030000000000000000000000000000000000000000000000000000",
                sizePc: 0x20000000,
            }
            incProof = {
                proofSubtree: {
                    index: 0x5,
                    path: [
                        "0x0d0e0a0100020000000000000000000000000000000000000000000000000000",
                        "0x0d0e0a0100040000000000000000000000000000000000000000000000000000",
                        "0xb6a5c5d0cbaabd7e63de256c819d84623fde6f53d616120508667b12659f7c3e",
                        "0x2df9cf74cb24e6349b809399b3a046640219dce8b97954eec43bf605dcc59b2d",
                        "0xd8610218425ab5e95b1ca6239d29a2e420d706a96f373e2f9c9a91d759d19b01",
                        "0xd628c4e101d5ca9aa4b341e4d0f028be8636fd7a0c3bf691cef16113b8d97932",
                    ],
                },

                proofIndex: {
                    index: 0x1ffc0003,
                    path: [
                        "0xca99a41370d2dd04f7d97b0fed8a9833031291a6f7c825d7245b428fef8b2734",
                        "0x2bc4f6cafd6a8366d032dfc7fceefd0ff2fb34dd2ea910da454773057333dd2a",
                        "0x578b81a6596624f326b1d31e2e3db91062545d2f819d605cc4afef3377151800",
                        "0x0e067c9486c9d41ff6cfeaf2d4b330d432e6aefa18eacbb5ce072ca197760215",
                        "0x1f7ac9595510e09ea41c460b176430bb322cd6fb412ec57cb17d989a4310372f",
                        "0xfc7e928296e516faade986b28f92d44a4f24b935485223376a799027bc18f833",
                        "0x08c47b38ee13bc43f41b915c0eed9911a26086b3ed62401bf9d58b8d19dff624",
                        "0xb2e47bfb11facd941f62af5c750f3ea5cc4df517d5c4f16db2b4d77baec1a32f",
                        "0xf9226160c8f927bfdcc418cdf203493146008eaefb7d02194d5e548189005108",
                        "0x2c1a964bb90b59ebfe0f6da29ad65ae3e417724a8f7c11745a40cac1e5e74011",
                        "0xfee378cef16404b199ede0b13e11b624ff9d784fbbed878d83297e795e024f02",
                        "0x8e9e2403fa884cf6237f60df25f83ee40dca9ed879eb6f6352d15084f5ad0d3f",
                        "0x752d9693fa167524395476e317a98580f00947afb7a30540d625a9291cc12a07",
                        "0x7022f60f7ef6adfa17117a52619e30cea82c68075adf1c667786ec506eef2d19",
                        "0xd99887b973573a96e11393645236c17b1f4c7034d723c7a99f709bb4da61162b",
                        "0xd0b530dbb0b4f25c5d2f2a28dfee808b53412a02931f18c499f5a254086b1326",
                        "0x84c0421ba0685a01bf795a2344064fe424bd52a9d24377b394ff4c4b4568e811",
                        "0x65f29e5d98d246c38b388cfc06db1f6b021303c5a289000bdce832a9c3ec421c",
                        "0xa2247508285850965b7e334b3127b0c042b1d046dc54402137627cd8799ce13a",
                        "0xdafdab6da9364453c26d33726b9fefe343be8f81649ec009aad3faff50617508",
                        "0xd941d5e0d6314a995c33ffbd4fbe69118d73d4e5fd2cd31f0f7c86ebdd14e706",
                        "0x514c435c3d04d349a5365fbd59ffc713629111785991c1a3c53af22079741a2f",
                        "0xad06853969d37d34ff08e09f56930a4ad19a89def60cbfee7e1d3381c1e71c37",
                        "0x39560e7b13a93b07a243fd2720ffa7cb3e1d2e505ab3629e79f46313512cda06",
                        "0xccc3c012f5b05e811a2bbfdd0f6833b84275b47bf229c0052a82484f3c1a5b3d",
                        "0x7df29b69773199e8f2b40b77919d048509eed768e2c7297b1f1437034fc3c62c",
                        "0x66ce05a3667552cf45c02bcc4e8392919bdeac35de2ff56271848e9f7b675107",
                        "0xd8610218425ab5e95b1ca6239d29a2e420d706a96f373e2f9c9a91d759d19b01",
                        "0xd0eef6d1bccabc5b5b9e3af2fea8ea9d184f08f43ac2071bdc635d44bbe35115",
                    ],
                },
            }
            expectedAux = {
                commPa: "0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127",
                sizePa: 0x800000000
            }
            await expect(this.dealstatus.complete(1, 2222, 4321, incProof, verifData)).to.emit(this.dealstatus, "CompleteAggregatorRequest").withArgs(1, 2222);
            const allDeals = await this.dealstatus.getAllDeals("0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127");
            expect(allDeals.toString()).to.be.equal("1234,4321,2222,4321");
        });
        
        it("Should return all the input cid's active dealIds", async function() {
            const activeDeals = await this.dealstatus.callStatic.getActiveDeals("0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127");
            expect(activeDeals.toString()).to.be.equal("1234,4321,2222,4321");
        });

        it("Should return all the deals' dealIds if they are expiring within a certain input epoch", async function() {
            const expiringDeals = await this.dealstatus.callStatic.getExpiringDeals("0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127", 1000);
            expect(expiringDeals.toString()).to.be.equal("1234,4321,2222,4321");
        });
        it("Should be able to return the miner of a deal", async function() {
            const allDeals = await this.dealstatus.getAllDeals("0x0181e2039220203f46bc645b07a3ea2c04f066f939ddf7e269dd77671f9e1e61a3a3797e665127");
            // console.log(allDeals);
            expect(allDeals[1].minerId.toString()).to.be.equal("4321");
        });
    });
});