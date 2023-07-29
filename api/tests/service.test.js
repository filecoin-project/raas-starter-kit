const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const {
    ethers
} = require("hardhat");

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
    });
});