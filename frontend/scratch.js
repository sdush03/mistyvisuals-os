const { parsePhoneNumberFromString } = require('libphonenumber-js')
const parsed = parsePhoneNumberFromString('756000899')
console.log('country:', parsed ? parsed.country : 'null')
console.log('nationalNumber:', parsed ? parsed.nationalNumber : 'null')
