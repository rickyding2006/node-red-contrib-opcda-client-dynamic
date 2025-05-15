/**
 * Modified from [emrebekar/node-red-contrib-opcda-client](https://github.com/emrebekar/node-red-contrib-opcda-client)
 * Copyright (c) 2025 rickyding2006
 */

module.exports = function(RED) {
    const opcda = require('node-opc-da');
    const { OPCServer } = opcda;
    const { ComServer, Session, Clsid } = opcda.dcom;

    const errorCode = {
        0x80040154: "Clsid is not found.",
        0x00000005: "Access denied. Username and/or password might be wrong.",
        0xC0040006: "The Items AccessRights do not allow the operation.",
        0xC0040004: "The server cannot convert the data between the specified format/ requested data type and the canonical data type.",
        0xC004000C: "Duplicate name not allowed.",
        0xC0040010: "The server's configuration file is an invalid format.",
        0xC0040009: "The filter string was not valid",
        0xC0040001: "The value of the handle is invalid. Note: a client should never pass an invalid handle to a server. If this error occurs, it is due to a programming error in the client or possibly in the server.",
        0xC0040008: "The item ID doesn't conform to the server's syntax.",
        0xC0040203: "The passed property ID is not valid for the item.",
        0xC0040011: "Requested Object (e.g. a public group) was not found.",
        0xC0040005: "The requested operation cannot be done on a public group.",
        0xC004000B: "The value was out of range.",
        0xC0040007: "The item ID is not defined in the server address space (on add or validate) or no longer exists in the server address space (for read or write).",
        0xC004000A: "The item's access path is not known to the server.",
        0x0004000E: "A value passed to WRITE was accepted but the output was clamped.",
        0x0004000F: "The operation cannot be performed because the object is being referenced.",
        0x0004000D: "The server does not support the requested data rate but will use the closest available rate.",
        0x00000061: "Clsid syntax is invalid"
    };

    function OPCDARead(config) {
        RED.nodes.createNode(this, config);
        let node = this;

        let server = RED.nodes.getNode(config.server);
        let serverHandles = [];
        let clientHandles = {};

        node.opcServer = null;
        node.comServer = null;

        node.opcSyncIO = null;
        node.opcItemMgr = null;

        node.opcGroup = null;

        node.isConnected = false;
        node.isReading = false;

        if (!server) {
            node.error("Please select a server.");
            return;
        }

        if (!server.credentials) {
            node.error("Failed to load credentials!");
            return;
        }

        node.updateStatus = function (status) {
            switch (status) {
                case "disconnected":
                    node.status({ fill: "red", shape: "ring", text: "Disconnected" });
                    break;
                case "timeout":
                    node.status({ fill: "red", shape: "ring", text: "Timeout" });
                    break;
                case "connecting":
                    node.status({ fill: "yellow", shape: "ring", text: "Connecting" });
                    break;
                case "error":
                    node.status({ fill: "red", shape: "ring", text: "Error" });
                    break;
                case "noitem":
                    node.status({ fill: "yellow", shape: "ring", text: "No Item" });
                    break;
                case "badquality":
                    node.status({ fill: "red", shape: "ring", text: "Bad Quality" });
                    break;
                case "goodquality":
                    node.status({ fill: "blue", shape: "ring", text: "Good Quality" });
                    break;
                case "ready":
                    node.status({ fill: "green", shape: "ring", text: "Ready" });
                    break;
                case "reading":
                    node.status({ fill: "blue", shape: "ring", text: "Reading" });
                    break;
                case "mismatch":
                    node.status({ fill: "yellow", shape: "ring", text: "Mismatch Data" });
                    break;
                default:
                    node.status({ fill: "grey", shape: "ring", text: "Unknown" });
                    break;
            }
        }

        node.init = function () {
            return new Promise(async function (resolve, reject) {
                if (!node.isConnected) {
                    try {
                        node.updateStatus('connecting');

                        var timeout = parseInt(server.config.timeout);
                        var comSession = new Session();

                        comSession = comSession.createSession(server.config.domain, server.credentials.username, server.credentials.password);
                        comSession.setGlobalSocketTimeout(timeout);

                        node.tout = setTimeout(function () {
                            node.updateStatus("timeout");
                            reject("Connection Timeout");
                        }, timeout);

                        node.comServer = new ComServer(new Clsid(server.config.clsid), server.config.address, comSession);
                        await node.comServer.init();

                        var comObject = await node.comServer.createInstance();
                        node.opcServer = new OPCServer();
                        await node.opcServer.init(comObject);

                        clearTimeout(node.tout);

                        serverHandles = [];
                        clientHandles = {};

                        node.opcGroup = await node.opcServer.addGroup(config.id, null);
                        node.opcItemMgr = await node.opcGroup.getItemManager();
                        node.opcSyncIO = await node.opcGroup.getSyncIO();

                        let clientHandle = 1;
                        var itemsList = config.groupitems.map(e => {
                            return { itemID: e, clientHandle: clientHandle++ };
                        });

                        var addedItems = await node.opcItemMgr.add(itemsList);

                        for (let i = 0; i < addedItems.length; i++) {
                            const addedItem = addedItems[i];
                            const item = itemsList[i];

                            if (addedItem[0] !== 0) {
                                let errorCodeHex = (new Uint32Array([addedItem[0]]))[0].toString(16).toUpperCase();                    
                                node.warn(`Error adding item：'${item.itemID}'，err_code: 0x${errorCodeHex}`);
                            } else {
                                serverHandles.push(addedItem[1].serverHandle);
                                clientHandles[item.clientHandle] = item.itemID;
                            }
                        }

                        node.isConnected = true;
                        node.updateStatus('ready');

                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }
            });
        }

        node.destroy = function () {
            return new Promise(async function (resolve) {
                try {
                    node.isConnected = false;

                    if (node.opcSyncIO) {
                        await node.opcSyncIO.end();
                        node.opcSyncIO = null;
                    }

                    if (node.opcItemMgr) {
                        await node.opcItemMgr.end();
                        node.opcItemMgr = null;
                    }

                    if (node.opcGroup) {
                        await node.opcGroup.end();
                        node.opcGroup = null;
                    }

                    if (node.opcServer) {
                        node.opcServer.end();
                        node.opcServer = null;
                    }

                    if (node.comServer) {
                        node.comServer.closeStub();
                        node.comServer = null;
                    }

                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        }

        let oldValues = [];
 node.readGroup = function readGroup(cache) {
    var dataSource = cache ? opcda.constants.opc.dataSource.CACHE : opcda.constants.opc.dataSource.DEVICE;

    node.isReading = true;
    node.opcSyncIO.read(dataSource, serverHandles).then(valueSets => {
        var datas = [];
        var changedDatas = [];
        let isGood = true;

        for (let i in valueSets) {
            const currentValue = valueSets[i].value;
            const oldValue = oldValues[i];
            const hasChanged = currentValue !== oldValue;

            var quality;

            if (valueSets[i].quality >= 0 && valueSets[i].quality < 64) {
                quality = "BAD";
                isGood = false;
            } else if (valueSets[i].quality >= 64 && valueSets[i].quality < 192) {
                quality = "UNCERTAIN";
                isGood = false;
            } else if (valueSets[i].quality >= 192 && valueSets[i].quality <= 219) {
                quality = "GOOD";
            } else {
                quality = "UNKNOWN";
                isGood = false;
            }

            var data = {
                itemID: clientHandles[valueSets[i].clientHandle],
                errorCode: valueSets[i].errorCode,
                quality: quality,
                timestamp: valueSets[i].timestamp,
                value: currentValue,
            };

            datas.push(data);

            if (hasChanged) {
                changedDatas.push(data);
            }

            oldValues[i] = currentValue;
        }

        if (isGood) {
            if (config.groupitems.length === datas.length) {
                node.updateStatus('goodquality');
            } else if (config.groupitems.length !== datas.length) {
                node.updateStatus('mismatch');
            } else if (config.groupitems.length < 1) {
                node.updateStatus('noitem');
            }

            if (config.datachange) {
                if (changedDatas.length > 0) {
                    var msg = { payload: changedDatas };
                    node.send(msg);
                }
            } else {
                var msg = { payload: datas };
                node.send(msg);
            }
        } else {
            node.updateStatus('badquality');
        }

        node.isReading = false;
    }).catch(e => {
        node.error("opcda-error", e.message);
        node.updateStatus("error");
        node.reconnect();
    });
}

node.readTags = async function (tags, cache) {
    var dataSource = cache ? opcda.constants.opc.dataSource.CACHE : opcda.constants.opc.dataSource.DEVICE;

    node.isReading = true;   
    try {
        if (!node.tagCache) {
            node.tagCache = new Map(); 
        }
        
        var valueSetsPromises = [];
        var newAddedTags = [];   
        
        for (const tag of tags) {
            const serverHandle = node.tagCache.get(tag);
            
            if (serverHandle !== undefined) {
                
                valueSetsPromises.push(
                    node.opcSyncIO.read(dataSource, [serverHandle])
                        .then(valueSet => {
     //                       node.log(`cache read: ${tag} (serverHandle: ${serverHandle})`);
                            return valueSet;
                        })
                        .catch(err => {
                            node.warn(`cache invaild，delete: ${tag} (serverHandle: ${serverHandle})`);
                            node.tagCache.delete(tag);
                            throw err; 
                        })
                );
            } else {
                const clientHandle = Date.now(); 
                
                const addedItems = await node.opcItemMgr.add([{ itemID: tag, clientHandle }]);
                const [errorCode, handle] = addedItems[0];
                
                if (errorCode !== 0) {             
                    let errorCodeHex = (new Uint32Array([errorCode]))[0].toString(16).toUpperCase();                    
                    node.warn(`Error adding item：'${tag}', err_code: 0x${errorCodeHex}`);
                } else {
                    const serverHandle = handle.serverHandle;
                    node.tagCache.set(tag, serverHandle); 
                    
                    newAddedTags.push(tag);
                    valueSetsPromises.push(
                        node.opcSyncIO.read(dataSource, [serverHandle])
                            .then(valueSet => {
                       //         node.log(`new add: ${tag} (serverHandle: ${serverHandle})`);
                                return valueSet;
                            })
                    );
                }
            }
        }
              
        // read all data from opcda server
        var results = await Promise.all(valueSetsPromises);
        
        // process result
        var datas = [];
        let isGood = true;

        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i];
            const valueSet = results[i];
            
            if (valueSet && valueSet[0]) {
                var quality;
                const qualityValue = valueSet[0].quality;
                
                if (qualityValue >= 0 && qualityValue < 64) {
                    quality = "BAD";
                    isGood = false;
                } else if (qualityValue >= 64 && qualityValue < 192) {
                    quality = "UNCERTAIN";
                    isGood = false;
                } else if (qualityValue >= 192 && qualityValue <= 219) {
                    quality = "GOOD";
                } else {
                    quality = "UNKNOWN";
                    isGood = false;
                }

                datas.push({
                    itemID: tag,
                    errorCode: valueSet[0].errorCode,
                    quality: quality,
                    timestamp: valueSet[0].timestamp,
                    value: valueSet[0].value,
                });
            } else {
  //              node.warn(`read ${tag} null`);
                isGood = false;
            }
        }
        
        if (isGood) {
            node.updateStatus('goodquality');
        } else {
            node.updateStatus('badquality');
        }
        
        // send result
        var msg = { payload: datas };
        node.send(msg);
//        node.log(`cache size: ${node.tagCache.size}`);
        
    } catch (e) {
        node.error("opcda-error: " + e.message);
        node.updateStatus("error");
        
        // delete unused tags
        tags.forEach(tag => {
            if (node.tagCache.get(tag)) {
 //               node.log(`delete invalid tag: ${tag}`);
                node.tagCache.delete(tag);
            }
        });
        
        node.reconnect(); 
    } finally {
        node.isReading = false;
    }
};


        node.isReconnecting = false;
        node.reconnect = async function () {           

          if (!node.tagCache) {
              node.tagCache = new Map();
           }
          node.tagCache.clear();  //clear all tag cache when reconnect

            try {
                if (!node.isReconnecting) {
                    node.isReconnecting = true;
                    await node.destroy();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await node.init();
                    node.isReconnecting = false;
                }

                node.comServer.on('disconnected', async function () {
                    node.isConnected = false;
                    node.updateStatus('disconnected');
                    await node.reconnect();
                });
            } catch (e) {
                node.isReconnecting = false;
                if (errorCode[e]) {
                    node.updateStatus('error');
                    switch (e) {
                        case 0x00000005:
                        case 0xC0040010:
                        case 0x80040154:
                        case 0x00000061:
                            node.error(errorCode[e]);
                            return;
                        default:
                            node.error(errorCode[e]);
                            await node.reconnect();
                    }
                } else {
                    node.error(e);
                    await node.reconnect();
                }
            }
        }

        node.reconnect();

        node.on('input', function (msg) {
            if (node.isConnected && !node.isReading) {
                let tags = msg.payload && Array.isArray(msg.payload.tags) ? msg.payload.tags : null;
                if (tags) {
                    node.readTags(tags, config.cache);
                } else {
                    node.readGroup(config.cache);
                }
            }
        });

        node.on('close', function (done) {
            node.status({});
            node.destroy().then(function () {
                done();
            });
        });
    }

    RED.nodes.registerType("opcda-read", OPCDARead);
}