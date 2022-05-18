import ts from 'typescript'
import { createHmac } from 'crypto'
import { sign } from 'jsonwebtoken'

const QUERYSCOPE_PRIVATE_KEY = process.env.QUERYSCOPE_PRIVATE_KEY
const QUERYSCOPE_ISSUER = process.env.QUERYSCOPE_ISSUER ?? 'unknown'
const QUERYSCOPE_CLIENT_ID = process.env.QUERYSCOPE_CLIENT_ID

function queryDigest (clientId: string, query: string) {
  return createHmac('sha256', clientId).update(query).digest('hex')
}

function syncSignQueryDigest (query: string): string|undefined {
  if (QUERYSCOPE_CLIENT_ID != null && QUERYSCOPE_PRIVATE_KEY != null) {
    // throw new Error('The queryscope private key has not been set.')
    const qd = queryDigest(QUERYSCOPE_CLIENT_ID, query)
    return sign({ qd }, QUERYSCOPE_PRIVATE_KEY, { algorithm: "RS256" })
  }
  return undefined
}

enum QSState {
  Start = 'START',
  VariableDeclaration = 'VARIABLE_DECLARATION',
  QSPTypeReference = 'QUERYSCOPEPART_TYPE_REFERENCE',
  QSTypeReference = 'QUERYSCOPE_TYPE_REFERENCE',
  QSObjectLiteralExpression = 'QUERYSCOPE_OBJECT_LITERAL_EXPRESSION'
}

const foundQueryScopeParts = new Map<string, string>()
const transformer: ts.TransformerFactory<ts.SourceFile> = ctx => {
  if (QUERYSCOPE_CLIENT_ID == null || QUERYSCOPE_PRIVATE_KEY == null) {
    console.log('WARN: No QUERYSCOPE private key cert or client id was found. Will skip token signing process.')
  } else {
    console.log("Signing client %s queries with %s issuer.", QUERYSCOPE_CLIENT_ID, QUERYSCOPE_ISSUER)
  }
  return sourceFile => {
    let variable: string|undefined
    let query = false
    let state = QSState.Start
    let queryTemplateExpanded = ''
    //   TemplateExpresson:
    //     TemplateHead,
    //     TemplateSpan(Identifier,TemplateMiddle),
    //     TemplateSpan(Identifier,TemplateTail)
    const startPartExpander = (node: ts.Node): ts.Node => {
      if (foundQueryScopeParts.has(variable || '_unknown')) {
        throw Error('QueryScopePart ' + variable + 'name is already used')
      }
      const partExpander = (node: ts.Node): ts.Node => {
        if (variable == null) {
          variable = '_unknown'
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          foundQueryScopeParts.set(variable, node.getText().replace(/(^["'`])|(["'`]$)/g, ''))
          return node
        } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
          // May need to reset when head if variable names are allowed to be reused.
          foundQueryScopeParts.set(variable, (foundQueryScopeParts.get(variable) ?? '') + node.text)
        } else if (ts.isIdentifier(node)) {
          if (foundQueryScopeParts.has(node.getText())) {
            foundQueryScopeParts.set(variable, (foundQueryScopeParts.get(variable) ?? '') + foundQueryScopeParts.get(node.getText()))
          } else {
            throw Error('QueryScopePart ' + node.getText() + ' not found.')
          }
        } else if (ts.isTemplateTail(node)) {
          foundQueryScopeParts.set(variable, (foundQueryScopeParts.get(variable) ?? '') + node.text)
          return node
        }
        return ts.visitEachChild(node, partExpander, ctx)
      };
      return partExpander(node)
    };
    const startQueryScopeObject = (node: ts.Node): ts.Node => {
      let queryExpanded = ''
      const startQueryExpander = (node: ts.Node): ts.Node => {
        const queryExpander = (node: ts.Node): ts.Node => {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            queryExpanded = node.getText().replace(/(^["'`])|(["'`]$)/g, '')
            return node
          } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
            queryExpanded += node.text
          } else if (ts.isIdentifier(node)) {
            if (foundQueryScopeParts.has(node.getText())) {
              queryExpanded += foundQueryScopeParts.get(node.getText())
            } else {
              throw Error('QueryScopePart '+node.getText()+' not found.')
            }
          } else if (ts.isTemplateTail(node)) {
            queryExpanded += node.text
          }
          return ts.visitEachChild(node, queryExpander, ctx)
        };
        return queryExpander(node)
      };
      const queryScopeObject = (node: ts.Node): ts.Node => {
        if (ts.isIdentifier(node) && node.getText() === 'query') {
          query = true
        } else if (query && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) ) ) {
          return startQueryExpander(node)
        }
        return ts.visitEachChild(node, queryScopeObject, ctx)
      };
      // There is an invalid case where TypeScript would produce an error
      // during compilation, should no query property is found.
      // Check if token mataches query and if not then return with all properties with new token value.
      // Probably will not implement this as tokens will never exist in the ts file as they are generated
      // at build time and will only exist within the image. We are going just overwrite the token.
      // Check declorator to see if we wish to maintain this query and if so then return
      // all properties with an appended token property and the generated token value
      const newNode = queryScopeObject(node)
      query = false
      const token = syncSignQueryDigest(queryExpanded)
      // console.log("Found variable %s, with only query: %s, and new token %s", variableId, JSON.stringify(query), token)
      if (token != null) {
        return ts.factory.createObjectLiteralExpression([
          ts.factory.createPropertyAssignment('query', ts.factory.createStringLiteral(queryExpanded)),
          ts.factory.createPropertyAssignment('token', ts.factory.createStringLiteral(token))
        ])
      } else {
        return newNode
      }
    };
    const visitor = (node: ts.Node): ts.Node => {
      // Skip queryscope signing process if no client_id or private_key are provided
      // This is mostly for development work where signatures are not used.
      if (QUERYSCOPE_CLIENT_ID == null || QUERYSCOPE_PRIVATE_KEY == null) {
        return node
      }
      let removeNode = false
      const visitConstVariable = (node: ts.Node): ts.Node => {
        if (ts.isVariableDeclaration(node)) {
          state = QSState.VariableDeclaration
          variable = undefined
        } else if (state === QSState.VariableDeclaration && ts.isIdentifier(node)) {
          variable = node.getText()
        } else if (state === QSState.VariableDeclaration && ts.isTypeReferenceNode(node)) {
          if (node.getText() === 'QueryScopePart') {
            state = QSState.QSPTypeReference
          } else if (node.getText() === 'QueryScope') {
            state = QSState.QSTypeReference
          } else {
            state = QSState.Start
          }
        } else if (state === QSState.QSPTypeReference) {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
            state = QSState.Start
            removeNode = true
            return startPartExpander(node)
          }
        } else if (state === QSState.QSTypeReference && ts.isObjectLiteralExpression(node)) {
          state = QSState.Start
          removeNode = false
          return startQueryScopeObject(node)
        }
        return ts.visitEachChild(node, visitConstVariable, ctx)
      };
      if (ts.isVariableStatement(node) && node.getText().startsWith('const ')) {
        let newNode = visitConstVariable(node)
        if (removeNode) {
          console.log('Should remove QueryScopePart type, but undefined for some reason is not a Node type')
          return newNode
        } else {
          return newNode
        }
      }
      return ts.visitEachChild(node, visitor, ctx)
    };
    return ts.visitNode(sourceFile, visitor);
  };
};

export default transformer;
