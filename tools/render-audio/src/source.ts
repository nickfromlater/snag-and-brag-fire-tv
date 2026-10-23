import ts from 'typescript';

export interface CallSite {
  file: 'reference/src/game.js';
  line: number;
  column: number;
  kind: 'call' | 'callback' | 'embedded';
  expression: string;
}

export function extractAudio(source: string): { code: string; startLine: number; endLine: number } {
  const start = source.indexOf('var AU=');
  const end = source.indexOf('\n/* =====================================================================\n   DEFS:', start);
  if (start < 0 || end < 0) throw new Error('Cannot locate the complete mockup audio section.');
  const code = source.slice(start, end);
  if (!code.includes('SFX.boom=function') || !code.includes('SFX.ko=function') || !code.includes('var MUS=')) {
    throw new Error('The extracted mockup audio block is incomplete.');
  }
  return { code, startLine: source.slice(0, start).split('\n').length, endLine: source.slice(0, end).split('\n').length - 1 };
}

/** Parse every direct call, setTimeout callback and nested SFX call, without executing the game. */
export function inspectSource(source: string) {
  const ast = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const callSites: Record<string, CallSite[]> = {};
  const definitions = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'SFX' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) if (property.name) definitions.add(property.name.getText(ast));
    }
    if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText(ast);
      const effect = node.name.text;
      const isDefinition = ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      if (owner === 'SFX' && isDefinition) definitions.add(effect);
      else if (owner === 'SFX' || (owner === 'this' && ['shutter', 'crowd'].includes(effect))) {
        const isCall = ts.isCallExpression(node.parent) && node.parent.expression === node;
        const location = ast.getLineAndCharacterOfPosition(node.getStart(ast));
        const expression = (isCall ? node.parent : node).getText(ast);
        (callSites[effect] ??= []).push({
          file: 'reference/src/game.js', line: location.line + 1, column: location.character + 1,
          kind: owner === 'this' ? 'embedded' : isCall ? 'call' : 'callback', expression,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { definitions: [...definitions].sort(), callSites };
}
