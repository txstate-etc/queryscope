import { expect } from 'chai'
import { QueryScope, QueryScopePart } from '../../lib/index'
import { querypart2 } from './fixtures'

// Parts
const querypart3: QueryScopePart = `  3`

const querypart4: QueryScopePart = `${querypart2}
${querypart3}
  4`

const query1: QueryScope = {
  query: `  1
${querypart4}
  5`
}

// Results
const querypart2_3_4result: string = `  2
  3
  4`

const query1result: string = `  1
  2
  3
  4
  5`

describe('basic tests', function () {
  it('should sign QueryScope type that has no token', async () => {
    console.log('query1 = %s', JSON.stringify(query1))
    expect(query1.query).to.be.a('string').equal(query1result)
    expect(query1.token).to.be.a('string')
  })
})
