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

enum QSType {
  QueryScope = 'QUERY_SCOPE',
  QueryScopePart = 'QUERY_SCOPE_PART',
}

const foundQueryScopeParts = new Map<string, string>()
const transformer: ts.TransformerFactory<ts.SourceFile> = ctx => {
  if (QUERYSCOPE_CLIENT_ID == null || QUERYSCOPE_PRIVATE_KEY == null) {
    console.log('WARN: No QUERYSCOPE private key cert or client id was found. Will skip token signing process.')
  } else {
    console.log("Signing client %s queries with %s issuer.", QUERYSCOPE_CLIENT_ID, QUERYSCOPE_ISSUER)
  }
  return sourceFile => {
    // Store variable name of current node being visited
    let variableName: string|undefined
    // VISITOR: for QueryScopePart type
    // Expanded string/template if necessary and assign result to associated queryscope part
    const startPartExpander = (node: ts.Node): ts.Node => {
      if (foundQueryScopeParts.has(variableName || '_unknown')) {
        throw Error('QueryScopePart ' + variableName + 'name is already used')
      }
      // should drill down until pass QueryScopePart identifier
      const partExpander = (node: ts.Node): ts.Node => {
        if (variableName == null) {
          variableName = '_unknown'
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          foundQueryScopeParts.set(variableName, node.getText().replace(/(^["'`])|(["'`]$)/g, ''))
          return node
        } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
          // May need to reset when head if variable names are allowed to be reused.
          foundQueryScopeParts.set(variableName, (foundQueryScopeParts.get(variableName) ?? '') + node.text)
        } else if (ts.isIdentifier(node)) {
          if (foundQueryScopeParts.has(node.getText())) {
            foundQueryScopeParts.set(variableName, (foundQueryScopeParts.get(variableName) ?? '') + foundQueryScopeParts.get(node.getText()))
          } else {
              throw Error('QueryScopePart variable: ' + node.getText() + ' not found.')
          }
        } else if (ts.isTemplateTail(node)) {
          foundQueryScopeParts.set(variableName, (foundQueryScopeParts.get(variableName) ?? '') + node.text)
          return node
        }
        return ts.visitEachChild(node, partExpander, ctx)
      };
      return partExpander(node)
    };
    // VISITOR: for QueryScope type
    // Expanded string/template if made up of queryscope parts if necessary
    // then assign result to associated QueryScope.query field
    // and generate/override associated QueryScope.token field.
    const startQueryScopeObject = (node: ts.Node): ts.Node => {
      let query = false
      let queryExpanded = ''
      // should drill down until pass QueryScope identifier
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
          query = false
          return startQueryExpander(node)
        }
        return ts.visitEachChild(node, queryScopeObject, ctx)
      };
      // There is an invalid case where TypeScript would produce an error during compilation,
      // should no query property be found.
      const newNode = queryScopeObject(node)
      const token = syncSignQueryDigest(queryExpanded)
      if (token != null) {
        return ts.factory.createObjectLiteralExpression([
          ts.factory.createPropertyAssignment('query', ts.factory.createStringLiteral(queryExpanded)),
          ts.factory.createPropertyAssignment('token', ts.factory.createStringLiteral(token))
        ])
      } else {
        return newNode
      }
    };
    // VISTOR: entrypoint for visitor looking for all const variable declarations.
    const visitor = (node: ts.Node): ts.Node|undefined => {
      // Skip queryscope signing process if no client_id or private_key are provided
      // This is mostly for development work where signatures are not used.
      if (QUERYSCOPE_CLIENT_ID == null || QUERYSCOPE_PRIVATE_KEY == null) {
        return node
      }
      let objectType: QSType|undefined
      // VISTOR: for grabbing variable name and redirecting to either QueryScope or QueryScopePart types
      const visitConstVariable = (node: ts.Node): ts.Node => {
        if (objectType === QSType.QueryScope) {
          if (ts.isObjectLiteralExpression(node)) {
            return startQueryScopeObject(node)
          }
        } else if (objectType === QSType.QueryScopePart) {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
            return startPartExpander(node)
          }
        } else {
          if (ts.isIdentifier(node)) {
            variableName = node.getText()
          } else if (ts.isTypeReferenceNode(node)) {
            if (node.getText() === 'QueryScopePart') {
              objectType = QSType.QueryScopePart
            } else if (node.getText() === 'QueryScope') {
              objectType = QSType.QueryScope
            } else {
              return node
            }
          }
        }
        return ts.visitEachChild(node, visitConstVariable, ctx)
      };
      if (ts.isVariableStatement(node) && node.getText().startsWith('const ')) {
        let newNode = visitConstVariable(node)
        if (objectType === QSType.QueryScopePart) {
          // Should be able to remove QueryScopePart type by returning undefined,
          // however for some reason is not a Node type')
          return undefined
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
