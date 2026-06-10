var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');


const GUILD_RANKS_ENUM = {
    OWNER: 'OWNER',
    CHIEF: 'CHIEF',
    STRATEGIST: 'STRATEGIST',
    CAPTAIN: 'CAPTAIN',
    RECRUITER: 'RECRUITER',
    RECRUIT: 'RECRUIT',
};

const GUILD_RANKS = [
    { name: GUILD_RANKS_ENUM.OWNER, value: '*****' },
    { name: GUILD_RANKS_ENUM.CHIEF, value: '****' },
    { name: GUILD_RANKS_ENUM.STRATEGIST, value: '***' },
    { name: GUILD_RANKS_ENUM.CAPTAIN, value: '**' },
    { name: GUILD_RANKS_ENUM.RECRUITER, value: '*' },
    { name: GUILD_RANKS_ENUM.RECRUIT, value: ' ' },
];

module.exports = {
    GUILD_RANKS_ENUM,

    formatEqualLength: function(values, field = null, returnEmptyString = true) {

        // Converts every value to a string
        values = _.map(values, value => {
            let val = field ? value[field] : value;
            if (!val && val !== 0) {
                if (returnEmptyString) {
                    if (field) {
                        value[field] = ' ';
                    } else {
                        value = ' ';
                    }
                }

                return value;
            }

            val = val.toString();
            
            if (field) {
                value[field] = val;
            } else {
                value = val;
            }

            return value;
        });

        // Checks which one of the values has the max length
        const maxLength = _.max(_.map(values, value => {
            if (!field) {
                return value?.length;
            }
           
            return value[field]?.length;
        }));
        
        if (!maxLength) {
            return values;
        }

        // Adds spaces at the end for all shorter ones
        return _.map(_.filter(values, value => !!value), value => {
            let formattedValue = field ? value[field] : value;
            if (!formattedValue) {
                formattedValue = '';
            }

            while (formattedValue.length < maxLength) {
                formattedValue = ' ' + formattedValue;
            }

            if (!field) {
                return formattedValue;
            } 

            value[field] = formattedValue;
            return value;
        });
    },
    getGuildRank: function(rank, invert = false, escape = false) {
        const guildRank = _.find(GUILD_RANKS, r => invert ? r.value === rank : r.name === rank);
        if (!guildRank) {
            console.log('Unknown rank (Invert: ' + invert + '): ' + rank);
            LogHelper.writeToLog('Unknown rank (Invert: ' + invert + '): ' + rank);

            return null;
        }

        let formattedRank = invert ? guildRank.name : guildRank.value;
        if (escape) {
            formattedRank = _.join(_.map(formattedRank, character => {
                character = '\\' + character;
                return character;
            }), '');
        }

        return formattedRank;
    },
    getFieldsFromValues(header, texts, firstPageHeader = null) {
        const fields = [];

        let currentField = { name: (firstPageHeader ?? '') + (header ?? ''), value: '' };
        _.forEach(texts, text => {
    
            // One field can max have 1024 lines of text
            if (currentField.value.length + text.length + 4 > 1024) {
                fields.push(currentField);
    
                currentField = _.cloneDeep(currentField);
                currentField.name = header ?? '';
                currentField.value = '';
                return;
            }
    
            // Linebreak and Space, because first char is always a Space with Discord's formatting
            if (currentField.value.length > 1) {
                currentField.value += '\n';
            }
        
            currentField.value += text;
        });
    
        // Adds the remaining text as a field
        if (currentField.value.length > 1) {
            currentField.value += '';
            fields.push(currentField);
        }
    
        return fields;
    },
    getFormattedTimeSinceTwoDates(compare1, compare2 = new Date()) {
        let timeInSeconds = Math.abs(compare1 - compare2) / 1000;
	    let formattedString = '';

        const days = Math.floor(timeInSeconds / 86400);
        if (days) {
            timeInSeconds -= days * 86400;
            formattedString += ' ' + days + 'd';
        }
        
        const hours = Math.floor(timeInSeconds / 3600) % 24;
        if (hours) {
            timeInSeconds -= hours * 3600;
            formattedString += ' ' + hours + 'h';
        }

        const minutes = Math.floor(timeInSeconds / 60) % 60;
        if (minutes) {
            timeInSeconds -= minutes * 60;
            formattedString += ' ' + minutes + 'm';
        }
        
        const seconds = timeInSeconds % 60;
        if (seconds) {
            formattedString += ' ' + Math.floor(seconds) + 's';
        }

        return _.trim(formattedString);
    }
}