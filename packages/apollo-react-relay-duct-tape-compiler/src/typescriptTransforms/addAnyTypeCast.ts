/**
 * Taken from https://github.com/relay-tools/relay-compiler-language-typescript/blob/3231ea09205cc341be704c00e78db0d8ff78b34a/src/addAnyTypeCast.ts
 * Copyright 2018 Kaare Hoff Skovgaard kaare@kaareskovgaard.net, Eloy Durán eloy.de.enige@gmail.com
 */

import * as ts from "typescript";

export default function addAsAnyToObjectLiterals(oldSource: string): string {
  function transformer<T extends ts.Node>(context: ts.TransformationContext) {
    return function transform(rootNode: T) {
      function visit(node: ts.Node): ts.Node {
        if (node.kind === ts.SyntaxKind.ObjectLiteralExpression) {
          return ts.factory.createAsExpression(
            node as ts.Expression,
            ts.factory.createTypeReferenceNode("any", []),
          );
        }
        return ts.visitEachChild(node, visit, context);
      }
      return ts.visitNode(rootNode, visit);
    };
  }

  const source = ts.createSourceFile(
    "",
    oldSource,
    ts.ScriptTarget.ES2015,
    true,
    ts.ScriptKind.TS,
  );

  const result = ts.transform(source, [transformer]);

  const printer: ts.Printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });
  return printer.printFile(result.transformed[0] as ts.SourceFile);
}
