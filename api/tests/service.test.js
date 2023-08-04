const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const {
    ethers
} = require("hardhat");
const axios = require('axios');

chai.use(chaiHttp);

const expect = chai.expect;

describe('API tests', () => {
    let server;
    // Start the server
    before(() => {
        server = require('../service');
    });

    describe('POST /api/register_job', () => {
        it('should register a new job successfully', async() => {
            const newJob = {
                cid: 'bafybeicgdjdvwes3e5aaicqljrlv6hpdfsducknrjvsq66d4gsvepolk6y',
                endDate: '2023-07-30',
                jobType: 'replication',
                replicationTarget: 5,
                aggregator: 'edge',
                epochs: 5
            };

            const res = await chai.request('http://localhost:1337') // Replace with your app's actual URL
                .post('/api/register_job')
                .query(newJob);

            expect(res.status).to.equal(201);
            expect(res.body.message).to.equal('Job registered successfully.');
        });
        it('should return an error if empty', async() => {
            const newJob = {
                cid: "",
                endDate: '2023-07-30',
                jobType: 'replication',
                replicationTarget: 5,
                aggregator: 'edge',
                epochs: 5
            };

            const res = await chai.request('http://localhost:1337') // Replace with your app's actual URL
                .post('/api/register_job')
                .query(newJob);

            // This assumes your application returns a 400 status code when the CID is invalid.
            // If your application behaves differently, you may need to adjust this test.
            expect(res.status).to.equal(400);
            expect(res.body.error).to.equal('CID cannot be empty');
        });
        it('should be able to get the current blocknumber', async() => {
            const url = 'https://api.node.glif.io';
            const data = {
                "jsonrpc": "2.0",
                "method": "eth_blockNumber",
                "params": [],
                "id": 1
            };

            try {
                const response = await axios.post(url, data);

                // convert the result to a number
                const blockNumber = parseInt(response.data.result, 16);
                expect(blockNumber).to.not.be.null;
            } catch (error) {
                console.error(error);
            }
        });
        it('should be able to call the repair endpoint', async() => {
            const params = [81630, null];
            const method = "Filecoin.StateMarketStorageDeal";

            const body = {
                jsonrpc: '2.0',
                id: 1,
                method: method,
                params: params
            };
            
            const response = await axios.post(process.env.LOTUS_RPC, body, {
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            expect(response.status).to.equal(200);
            expect(response.data.result).to.not.be.null;
            console.log(response.data.result);
        })
    });
});