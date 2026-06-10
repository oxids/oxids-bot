/*const { request } = require('undici');
const LogHelper = require('./log.helper.js');
var _ = require('lodash');
const { seqDBURL, seqDBUsername, seqDBPassword } = require('../config.json');
const sql = require('mssql')



// Only can do one request at a time
let CURRENTLY_READING = false;

module.exports = {
    sqlTypes: sql.TYPES,
    async executeSql(sql, parameters) {
       return await executeSql(sql, parameters);
    },
}



function executeSql(sqlQuery, parameters) {
    return new Promise(async resolve => {

        // API Rate Limit for SEQ API
        while (CURRENTLY_READING) {
            await waitTime(500);
        }

        CURRENTLY_READING = true;

        const pool = await sql.connect('Server=' + seqDBURL + ';Database=SEQUOIA_APPLICATION;User Id=' + seqDBUsername + ';Password=' + seqDBPassword + ';Encrypt=true;TrustServerCertificate=True')
        let result =  pool.request();

        for (const parameter of parameters) {
            result = result.input(parameter.name, parameter.type, parameter.value);
        }

        result = await result.query(sqlQuery);

        CURRENTLY_READING = false;
        resolve(result?.recordsets);
    }).catch(e => {
        console.log(e);
        LogHelper.writeToLog('seq-api.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));

        CURRENTLY_READING = false;
        return null;
    });
}

function waitTime(miliseconds) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, miliseconds);
    });
}*/