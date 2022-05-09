import * as ts from 'typescript'
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

//const transformerProgram = (program: ts.Program) => {

  // Create array of found QueryScopeParts
  const foundQueryScopeParts = new Map<string, string>()
  let templateExpanded: string;
  
  const transformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
    return sourceFile => {
      let state: QSState = QSState.Start
      let variable: string|undefined
      let query = false
      //   TemplateExpresson:
      //     TemplateHead,
      //     TemplateSpan(Identifier,TemplateMiddle),
      //     TemplateSpan(Identifier,TemplateTail)
      const templateExpander = (node: ts.Node): ts.Node => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          templateExpanded = node.getText().replace(/(^["'`])|(["'`]$)/g, '')
          if (!query) foundQueryScopeParts.set(variable || 'unknown', templateExpanded)
          console.log('  templateExpander %s = %s', variable, JSON.stringify(templateExpanded))
          return node
        } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
          templateExpanded += node.text
        } else if (ts.isIdentifier(node)) {
          if (foundQueryScopeParts.has(node.getText())) {
            templateExpanded += foundQueryScopeParts.get(node.getText())
          } else {
            throw Error('QueryScopePart '+node.getText()+' not found.')
          }
        } else if (ts.isTemplateTail(node)) {
          templateExpanded += node.text
          console.log('  templateExpander - tail: %s', JSON.stringify(templateExpanded))
          if (!query) foundQueryScopeParts.set(variable || 'unknown', templateExpanded)
        }
        return ts.visitEachChild(node, templateExpander, context)
      };
      const startTemplateExpander = (node: ts.Node): ts.Node => {
        templateExpanded = ''
        console.log('Start template expander: %s', variable)
        return templateExpander(node)
      };
      const queryScopeObject = (node: ts.Node): ts.Node => {
        if (ts.isIdentifier(node) && node.getText() === 'query') {
          query = true
        } else if (query && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) ) ) {
          startTemplateExpander(node)
          return node
        }
        return ts.visitEachChild(node, queryScopeObject, context)
      };
      const startQueryScopeObject = (node: ts.Node): ts.Node => {
        // There is an invalid case where TypeScript would produce an error
        // during compilation, should no query property is found.
        // Check if token mataches query and if not then return with all properties with new token value.
        // Probably will not implement this as tokens will never exist in the ts file as they are generated
        // at build time and will only exist within the image. We are going just overwrite the token.
        // Check declorator to see if we wish to maintain this query and if so then return
        // all properties with an appended token property and the generated token value
        const newNode = queryScopeObject(node)
        query = false
        const token = syncSignQueryDigest(templateExpanded)
        // console.log("Found variable %s, with only query: %s, and new token %s", variableId, JSON.stringify(query), token)
        if (token != null) {
          return ts.factory.createObjectLiteralExpression([
            ts.factory.createPropertyAssignment('query', ts.factory.createStringLiteral(templateExpanded)),
            ts.factory.createPropertyAssignment('token', ts.factory.createStringLiteral(token))
          ])
        } else {
          return newNode
        }
      };
      const visitor = (node: ts.Node): ts.Node => {
        if (QUERYSCOPE_CLIENT_ID == null || QUERYSCOPE_PRIVATE_KEY == null) {
          console.log('WARN: No QUERYSCOPE private key cert or client id was found. Will skip token signing process.')
          return node
        }
        console.log("Signing client %s queries with %s issuer.", QUERYSCOPE_CLIENT_ID, QUERYSCOPE_ISSUER)
        if (ts.isVariableDeclaration(node)) {
          state = QSState.VariableDeclaration
          variable = undefined
        } else if (state === QSState.VariableDeclaration && ts.isIdentifier(node)) {
          variable = node.getText()
        } else if (state === QSState.VariableDeclaration && ts.isTypeReferenceNode(node)) {
          if (node.getText() === 'QueryScopePart') {
            state = QSState.QSPTypeReference
            console.log('QueryScopePart variable declaration: %s', variable)
          } else if (node.getText() === 'QueryScope') {
            state = QSState.QSTypeReference
            console.log('QueryScope variable declaration: %s', variable)
          } else {
            state = QSState.Start
          }
        } else if (state === QSState.QSPTypeReference) {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
            state = QSState.Start
            return startTemplateExpander(node)
          }
        } else if (state === QSState.QSTypeReference && ts.isObjectLiteralExpression(node)) {
          state = QSState.Start
          return startQueryScopeObject(node)
        }
        return ts.visitEachChild(node, visitor, context)
      };
      return ts.visitNode(sourceFile, visitor)
    };
  };
//  return transformerFactory;
//};

export default transformerFactory;
//export default transformerProgram;
