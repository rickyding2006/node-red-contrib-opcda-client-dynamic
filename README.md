# node-red-contrib-opcda-client

This node can be used in order to read and write to OPC DA servers.
This node is based on emrebekar/node-red-contrib-opcda-client, modified opcda-read.js,
1)only valid tags is read for opcda-read when msg.payload tags is vaild
msg.payload = {
   tags: ["dev1.wendu","dev1.yali"]   
};
2) for normal read( no payload tags ), only value changed tags will ouput when data change is checked. For example,devl.wendu and devl.yali were set,only devl.wendu value changed, opcda-read will only output devl .wendu
3) for dynamic read ( payload tags valid ), data change check is useless , all payload tags will output.

- opcda-server
- opcda-read
- opcda-write

## Input Parameters
### opcda-server
#### Name (Optional)
Name of the OPC DA Server to be shown in node.
#### Address
Address of the OPC DA Server
#### Domain(Optional)
Domain of account if necessary.
#### Username(Optional)
Username of account if necessary.
#### Password(Optional)
Password of account if necessary.
#### ClsId
Class ID of the OPC DA Server.
#### Timeout(Optional)
Timeout of server connection.

### opcda-read
#### Server
OPC DA server which is wanted to connect.
#### Group Name(Optional)
Node name to be shown in node-red.
#### Cache Read (Optinal)
Check if wanted to read tags from cache.
#### Data Change (Optional)
Check if wanted to output msg.payload when value of tag changes.
#### OPC DA Tags
Add OPC DA tags wanted to read.

### opcda-write 
#### Server 
OPC DA server which is wanted to connect.
#### Name (Optional)
Node name to be shown in node-red.
#### Usage
set msg.payload parameter with the following;

```
[
    {"itemID":"<ItemID want to set>","type":"<type of the value>","value": <value want to set>},
            .
            .
            .
]
```

###### Accepted Data Types
- double
- short
- integer
- float
- byte
- long
- boolean
- uuid
- string
- char
- date
- currency
- array

#### Screenshots

##### opcda-server
![opcda-server](https://raw.githubusercontent.com/emrebekar/node-red-contrib-opcda-client/master/images/opcda_server.png)

##### opcda-read
![opcda-read](https://raw.githubusercontent.com/emrebekar/node-red-contrib-opcda-client/master/images/opcda_read.png)

##### opcda-write
![opcda-write](https://raw.githubusercontent.com/emrebekar/node-red-contrib-opcda-client/master/images/opcda_write.png)
