import * as ts from 'typescript'
import { createHmac } from 'crypto'
import { sign } from 'jsonwebtoken'

const QUERYSCOPE_PRIVATE_KEY = process.env.QUERYSCOPE_PRIVATE_KEY
const QUERYSCOPE_ISSUER = process.env.QUERYSCOPE_ISSUER ?? 'queryscope'
const QUERYSCOPE_CLIENT_ID = process.env.QUERYSCOPE_CLIENT_ID

function queryDigest (clientId: string, query: string) {
  return createHmac('sha256', clientId).update(query).digest('hex')
}

// async function signQueryDigest (query: string): Promise<string|undefined> {
//   if (QUERYSCOPE_CLIENT_ID != null && QUERYSCOPE_PRIVATE_KEY != null) {
//     const qd = queryDigest(QUERYSCOPE_CLIENT_ID, query)
//     return await new SignJWT({ qd })
//       .setProtectedHeader({ alg: 'RS256' })
//       .setIssuedAt()
//       .setIssuer(QUERYSCOPE_ISSUER)
//       .sign(QUERYSCOPE_PRIVATE_KEY)
//   }
//   return undefined
// }

function syncSignQueryDigest (query: string): string|undefined {
  if (QUERYSCOPE_CLIENT_ID != null && QUERYSCOPE_PRIVATE_KEY != null) {
    // throw new Error('The queryscope private key has not been set.')
    const qd = queryDigest(QUERYSCOPE_CLIENT_ID, query)
    return sign({ qd }, QUERYSCOPE_PRIVATE_KEY, { algorithm: "RS256" })
  }
  return undefined

}

enum QSState {
  Unknown = 'UNKNOWN',
  VariableDeclaration = 'VARIABLE_DECLARATION',
  QSTypeReference = 'QUERYSCOPE_TYPE_REFERENCE',
  QSObjectLiteralExpression = 'QUERYSCOPE_OBJECT_LITERAL_EXPRESSION'
}

const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
  return sourceFile => {
    var state: QSState = QSState.Unknown
    var variableId: string|undefined
    let token: string|undefined
    let query: string|undefined
    const visitor = (node: ts.Node): ts.Node => {
      if (QUERYSCOPE_CLIENT_ID == null || QUERYSCOPE_PRIVATE_KEY == null) return node
      if (ts.isVariableDeclaration(node)) {
        // VariableDeclaration 5 Children:
        //   Identifier
        //   TypeReference
        //   ObjectLIteralExpression
        state = QSState.VariableDeclaration
        variableId = undefined
        token = undefined
        query = undefined
        // console.log("Variable Declaration Found")
      } else if (state === QSState.VariableDeclaration && ts.isIdentifier(node)) {
        variableId = node.getText()
        // console.log("Variable Declaration Identifier Found %s", variableId)
      } else if (state === QSState.VariableDeclaration && ts.isTypeReferenceNode(node)) {
        // TypeReferenceNode 1 Child:
        //   Identifier
        if (node.getText() === 'QueryScope') {
          state = QSState.QSTypeReference
          // console.log("QueryScope Type Reference Found")
        } else {
          state = QSState.Unknown
          // console.log("Non QueryScope Type Reference Found")
        }
      } else if (state === QSState.QSTypeReference && ts.isObjectLiteralExpression(node)) {
        // QSObjectLiteralExpression 3 Children:
        // console.log("QueryScope Object Literal Expression Found")
        for (const p of node.properties) {
          // PropertyAssegnment 3 Children:
          //   name: Identifier
          //   initializer: StringLiteral|NoSubstitutionTemplateLiteral
          const name = p.name?.getText()
          const value = p.getChildAt(2).getText().replace(/(^["'`])|(["'`]$)/g, '')
          if (name === 'query') {
            query = value
          } else if (name === 'token') {
            token = value
          }
        }
        state = QSState.Unknown
        if (query != null) {
          // console.log("Found variable %s, with query: %s, token: %s", variableId, JSON.stringify(query), token)
          // Check if token mataches query and if not then return with all properties with new token value.
          // Probably will not implement this as tokens will never exist in the ts file as they are generated
          // at build time and will only exist within the image. We are going just overwrite the token.
          // Check declorator to see if we wish to maintain this query and if so then return
          // all properties with an appended token property and the generated token value
          token = syncSignQueryDigest(query)
          // console.log("Found variable %s, with only query: %s, and new token %s", variableId, JSON.stringify(query), token)
          if (token != null) {
            return ts.factory.createObjectLiteralExpression([
              ts.factory.createPropertyAssignment('query', ts.factory.createStringLiteral(query)),
              ts.factory.createPropertyAssignment('token', ts.factory.createStringLiteral(token))
            ])
          } else {
            return node
          }
        } else {
          // console.log("Found variable %s, with no query nor token fields", variableId)
          // This is kind of a pointless check as this case is invalid and TypeScript would produce an error
          // during compilation.
          return node
        }
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return ts.visitNode(sourceFile, visitor);
  };
};

export default transformer;
