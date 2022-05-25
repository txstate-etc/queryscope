import { expect } from 'chai'
import { QueryScope, QueryScopePart } from '../../lib/index'

// Parts
const someString: string = '  2'
let querypart1: QueryScopePart = '  1'
const querypart2: QueryScopePart = '  2'
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
    expect(query1.query).to.be.a('string').equal(query1result)
    expect(query1.token).to.be.a('string')
  })
  it('should not remove (nor use) non const query scope parts', async () => {
    expect(typeof querypart1).to.eq('string')
    expect(querypart1).to.eq('  1')
    // NOTE Cannot test if querypart1 is used as part of a QueryScope that an
    // error will throw because error happens in build phase and not during testing.
  })
  it('should remove const query scope parts', async () => {
    // Make sure can see other strings first
    expect(typeof someString).to.eq('string')
    expect(typeof querypart2).to.eq('undefined')
    expect(typeof querypart3).to.eq('undefined')
    expect(typeof querypart4).to.eq('undefined')
  })
})
