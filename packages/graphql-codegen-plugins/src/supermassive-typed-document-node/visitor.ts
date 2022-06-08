import autoBind from "auto-bind";
import { Types } from "@graphql-codegen/plugin-helpers";
import {
  LoadedFragment,
  ClientSideBaseVisitor,
  ClientSideBasePluginConfig,
  DocumentMode,
  RawClientSideBasePluginConfig,
} from "@graphql-codegen/visitor-plugin-common";
import {
  GraphQLSchema,
  FragmentDefinitionNode,
  DocumentNode,
  print,
  Kind,
  OperationDefinitionNode,
} from "graphql";
import {
  addTypesToRequestDocument,
  DocumentNode as SupermassiveDocumentNode,
} from "@graphitation/supermassive";
import { optimizeDocumentNode } from "@graphql-tools/optimize";
import gqlTag from "graphql-tag";

export class TypeScriptDocumentNodesVisitor extends ClientSideBaseVisitor<
  RawClientSideBasePluginConfig,
  ClientSideBasePluginConfig
> {
  constructor(
    schema: GraphQLSchema,
    fragments: LoadedFragment[],
    rawConfig: RawClientSideBasePluginConfig,
    documents: Types.DocumentFile[],
  ) {
    super(
      schema,
      fragments,
      {
        documentMode: DocumentMode.documentNodeImportFragments,
        documentNodeImport:
          "@graphql-typed-document-node/core#TypedDocumentNode",
        ...rawConfig,
      },
      {},
      documents,
    );

    autoBind(this);

    // We need to make sure it's there because in this mode, the base plugin doesn't add the import
    if (this.config.documentMode === DocumentMode.graphQLTag) {
      const documentNodeImport = this._parseImport(
        this.config.documentNodeImport || "graphql#DocumentNode",
      );
      const tagImport = this._generateImport(
        documentNodeImport,
        "DocumentNode",
        true,
      ) as string;
      this._imports.add(tagImport);
    }
  }

  protected _gql(
    node: FragmentDefinitionNode | OperationDefinitionNode,
  ): string {
    const supermassiveNode = addTypesToRequestDocument(this._schema, {
      kind: Kind.DOCUMENT,
      definitions: [node],
    }).definitions[0] as FragmentDefinitionNode | OperationDefinitionNode;

    const fragments = this._transformFragments(supermassiveNode);

    const doc = this._prepareDocument(`
    ${
      print(supermassiveNode)
        .split("\\")
        .join("\\\\") /* Re-escape escaped values in GraphQL syntax */
    }
    ${this._includeFragments(fragments)}`);

    if (this.config.documentMode === DocumentMode.documentNode) {
      let gqlObj = gqlTag([doc]);

      if (this.config.optimizeDocumentNode) {
        gqlObj = optimizeDocumentNode(gqlObj);
      }

      return JSON.stringify(this._transformDocumentNodeToSupermassive(gqlObj));
    } else if (
      this.config.documentMode === DocumentMode.documentNodeImportFragments
    ) {
      let gqlObj = gqlTag([doc]);

      if (this.config.optimizeDocumentNode) {
        gqlObj = optimizeDocumentNode(gqlObj);
      }

      if (fragments.length > 0) {
        const definitions = [
          ...gqlObj.definitions.map((t) =>
            JSON.stringify(
              addTypesToRequestDocument(this._schema, {
                kind: Kind.DOCUMENT,
                definitions: [t],
              }).definitions[0],
            ),
          ),
          ...fragments.map((name) => `...${name}.definitions`),
        ].join();

        return `{"kind":"${Kind.DOCUMENT}","definitions":[${definitions}]}`;
      }

      return JSON.stringify(this._transformDocumentNodeToSupermassive(gqlObj));
    } else if (this.config.documentMode === DocumentMode.string) {
      return "`" + doc + "`";
    }

    const gqlImport = this._parseImport(this.config.gqlImport || "graphql-tag");

    return (gqlImport.propName || "gql") + "`" + doc + "`";
  }

  private _transformDocumentNodeToSupermassive(document: DocumentNode) {
    return {
      ...document,
      definitions: document.definitions.map(
        (t) =>
          addTypesToRequestDocument(this._schema, {
            kind: Kind.DOCUMENT,
            definitions: [t],
          }).definitions[0],
      ),
    };
  }
  protected getDocumentNodeSignature(
    resultType: string,
    variablesTypes: string,
    node: FragmentDefinitionNode | OperationDefinitionNode,
  ) {
    if (
      this.config.documentMode === DocumentMode.documentNode ||
      this.config.documentMode === DocumentMode.documentNodeImportFragments ||
      this.config.documentMode === DocumentMode.graphQLTag
    ) {
      return ` as unknown as DocumentNode<${resultType}, ${variablesTypes}>`;
    }

    return super.getDocumentNodeSignature(resultType, variablesTypes, node);
  }
}
