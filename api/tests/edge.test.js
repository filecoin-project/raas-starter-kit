const fs = require('fs');
const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
const expect = chai.expect;
const EventEmitter = require('events');
const EdgeAggregator = require('../edgeAggregator');

describe('LighthouseAggregator', function() {
    let aggregator;
    let stateFilePath;

    beforeEach(function() {
        aggregator = new EdgeAggregator();
        stateFilePath = path.join(__dirname, '../../cache/edge_agg_state.json');
    
        // Create a WriteStream stub
        writeStream = new EventEmitter();
        writeStream.pipe = sinon.stub();
        sinon.stub(fs, 'createWriteStream').returns(writeStream);
    
        // Create a response stub
        response = { data: new EventEmitter() };
      });
    
      afterEach(function() {
        // Restore the stubs after each test
        sinon.restore();
      });
    
      after(function() {
        // Cleanup the dummy state file
        const filePath = path.join(__dirname, '../../cache/edge_agg_state.json');

        fs.unlinkSync(filePath);
      });

    describe('#saveState() and #loadState()', function() {
        it('returns an empty array when state file does not exist', function() {
            const state = aggregator.loadState();
            expect(state).to.eql([]);
        });

        it('saves the current state to the state file', function() {
            aggregator.enqueueJob('testcid', 'testtxid');

            // Act
            try {
                aggregator.saveState(stateFilePath);
            } catch (err) {
                console.error(err);
            }

            // Assert
            const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            console.log(state);
            expect(state).to.eql([{
                cid: 'testcid',
                txID: 'testtxid'
            }]);
        });

        context('when state file exists', function() {
            it('returns the data from the state file', function() {
                const state = aggregator.loadState();
                expect(state).to.eql([{
                    cid: 'testcid',
                    txID: 'testtxid'
                }]);
            });
        });

        describe('#enqueueJob()', function() {
            it('adds a new job to the aggregatorJobs array', function() {
                expect(aggregator.aggregatorJobs.length).to.equal(1);
                aggregator.enqueueJob('testcid2', 'testtxid2');
                expect(aggregator.aggregatorJobs.length).to.equal(2);
                expect(aggregator.aggregatorJobs[0]).to.deep.equal({
                    cid: 'testcid',
                    txID: 'testtxid'
                });
            });
        });

        describe('#dequeueJob()', function() {
            it('removes a job from the aggregatorJobs array', function() {
                expect(aggregator.aggregatorJobs.length).to.equal(1);
                aggregator.enqueueJob('testcid3', 'testtxid3');
                expect(aggregator.aggregatorJobs.length).to.equal(2);
                aggregator.dequeueJob('testtxid', 'testcid');
                expect(aggregator.aggregatorJobs.length).to.equal(2);
                aggregator.dequeueJob('testcid3', 'testtxid3');
                expect(aggregator.aggregatorJobs.length).to.equal(1);
                expect(aggregator.aggregatorJobs[0]).to.deep.equal({
                    cid: 'testcid',
                    txID: 'testtxid'
                });
            });
        });

        describe('#downloadFile()', function() {
            it('is able to download a test file from the endpoint, and make a deal with it', async function() {
                const edgeCID = "bafybeicgdjdvwes3e5aaicqljrlv6hpdfsducknrjvsq66d4gsvepolk6y";
                const downloadedPath = await aggregator.downloadFile(edgeCID, path.join(__dirname, `../download/${edgeCID}`));
                expect(fs.existsSync(downloadedPath)).to.be.true
            });
        });

        describe('#uploadFileAndMakeDeal()', function() {
            it('is able to download a test file from the endpoint, and make a deal with it', async function() {
                const edgeCID = "bafybeicgdjdvwes3e5aaicqljrlv6hpdfsducknrjvsq66d4gsvepolk6y";
                const downloadedPath = path.join(__dirname, `../download/${edgeCID}`);
                expect(fs.existsSync(downloadedPath)).to.be.true

                const deal = await aggregator.uploadFileAndMakeDeal(downloadedPath);
                // Assert that the deal response isn't undefined
                expect(deal).to.not.be.undefined;
            });
        });

        describe('#processDealInfos()', function() {
            it('is able to emit a DealReceived event with dealInfos', async function() {
                // Set up the aggregatorJobs array with a dummy job
                aggregator.aggregatorJobs.push({
                    cid: 'bafybeicgdjdvwes3e5aaicqljrlv6hpdfsducknrjvsq66d4gsvepolk6y',
                    txID: { type: 'BigNumber', hex: '0x42' },
                    contentID: 25500,
                });
                let eventWasEmitted = false;
                aggregator.eventEmitter.on('DealReceived', (dealInfos) => {
                    eventWasEmitted = true;

                    expect(dealInfos).to.have.property('dealID');
                    expect(dealInfos.dealID != 0);
                    expect(dealInfos).to.have.property('txID');
                    expect(dealInfos).to.have.property('inclusion_proof');
                    expect(dealInfos).to.have.property('verifier_data')
                    expect(dealInfos).to.have.property('miner');
                    expect(dealInfos.miner != 0 && dealInfos.miner.includes('t0'));
                });

                // Call the method
                await aggregator.processDealInfos(18, 1000, 25500);

                // Check that the event was emitted
                expect(eventWasEmitted).to.be.true;
            });
        });
    });
});