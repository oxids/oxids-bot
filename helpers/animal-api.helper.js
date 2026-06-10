const { request } = require('undici');
const LogHelper = require('./log.helper.js');
var _ = require('lodash');
const { catAPIKey, dogAPIKey } = require('../config.json');



module.exports = {
    async getCatImage(breed) {
        return await callCatDogApi('cat', breed);
    },
    async getDogImage(breed) {
        return await callCatDogApi('dog', breed);
    },
    async getCapyImage() {
        return await callApi('https://api.capy.lol/v1/capybara');
    },
    async getPokemonImage(dexNo) {
        const pokemon = await callApi('https://pokeapi.co/api/v2/pokemon/' + dexNo.toLowerCase(), null, true);
        if (!pokemon) {
            return null;
        }

        const flavorText = await callApi('https://pokeapi.co/api/v2/pokemon-species/' + pokemon.id, null, true);
        if (!flavorText) {
            return pokemon;
        }

        pokemon.flavor = _.filter(flavorText.flavor_text_entries, f => f.language?.name === 'en');
        return pokemon
    },
    async getAnimalImage(animal) {
        return await callRandomApi(animal);
    }
}



async function callCatDogApi(animal, breed) {
    let url, apiKey;

    switch (animal) {
        case 'cat':
            url = 'https://api.thecatapi.com/v1/images/search?has_breeds=1';
            apiKey = catAPIKey;
            break;
        case 'dog':
            url = 'https://api.thedogapi.com/v1/images/search?has_breeds=1';
            apiKey = dogAPIKey;
            break;
        default:
            url = '';
            apiKey = '';
            break;
    }

    if (breed) {
        url += '?breed_ids=' + breed;
    }

    const value = await callApi(url, apiKey, true);
    if (!value?.length) {
        return null;
    }
    
    return _.first(value)?.url;
}

async function callRandomApi(animal) {
    const json = await callApi('https://some-random-api.com/animal/' + animal);
    const value = await json?.body?.json();

    if (!value?.image) {
        return null;
    }
    
    return value;
}

async function callApi(requestUrl, apiKey = null, parseJSON = false) {
    return new Promise(async resolve => {
        const promise = request(requestUrl, { headers: { 'x-api-key': apiKey }});
        if (!parseJSON) {
            resolve(promise);
            return;
        }

        const json = await promise;
        let parsed;
        try {
            parsed = await json?.body?.json();
        } catch {
            parsed = null;
        }

        resolve(parsed);
        return;
    }).catch(e => {
        console.log(e);
        LogHelper.writeToLog('animal-api.helper: ' + JSON.stringify(e, Object.getOwnPropertyNames(e)));
        return null;
    });
}