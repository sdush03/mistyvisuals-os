const { parsePhoneNumberFromString } = require('libphonenumber-js')
const parsed = parsePhoneNumberFromString('+756000899')
console.log('parsed with +7:', parsed ? 'exists' : 'null')
