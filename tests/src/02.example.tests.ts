import { expect } from 'chai'
import { QueryScope, QueryScopePart } from '../../lib/index'

// Parts
const firstname: QueryScopePart = '  firstname'
const lastname: QueryScopePart = `  lastname`
const firstLastPhone: QueryScopePart = `${firstname}
${lastname}
  phonenumber`

// Query
const queryUserPhoneInfo: QueryScope = {
  query: `query GetUserInfo($ids:[String!]) { users(filter:{ ids:$ids }) {
  id
${firstLastPhone}
}`
}

// Parts
const firstLastOffice: QueryScopePart = `${firstname}
${lastname}
  roomnumber`

// Query
const queryUserOfficeInfo: QueryScope = {
  token: '',
  query: `query GetUserInfo($names:[String!]) { users(filter:{ usernames:$names }) {
  username
${firstLastOffice}
}`
}

// Results
const queryUserPhoneResult: string = `query GetUserInfo($ids:[String!]) { users(filter:{ ids:$ids }) {
  id
  firstname
  lastname
  phonenumber
}`

const queryUserOfficeResult: string = `query GetUserInfo($names:[String!]) { users(filter:{ usernames:$names }) {
  username
  firstname
  lastname
  roomnumber
}`

describe('example tests', function () {
  it('should sign queryUserPhoneInfo QueryScope type that has no token', async () => {
    console.log('queryUserPhoneInfo = %s', JSON.stringify(queryUserPhoneInfo))
    expect(queryUserPhoneInfo.query).to.be.a('string').equal(queryUserPhoneResult)
    expect(queryUserPhoneInfo.token).to.be.a('string')
  })
  it('should sign queryUserOfficeInfo QueryScope type that has a blank token field appearing before query field', async () => {
    console.log('queryUserOfficeInfo = %s', JSON.stringify(queryUserOfficeInfo))
    expect(queryUserOfficeInfo.query).to.be.a('string').equal(queryUserOfficeResult)
    expect(queryUserOfficeInfo.token).to.be.a('string')
  })
})
