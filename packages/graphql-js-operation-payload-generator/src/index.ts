/**

query Foo {
  foo
  bar {
    ... on Bar {
      baz
    }
    bar
    ...BarFragment
  }
}
fragment BarFragment on Bar {
  bla
}

[
  { foo: "scalar" },
  {
    bar: [
      [
        { baz: "scalar" },
      ],
      { bar: "scalar" }
      [
        { bla: "scalar" },
      ],
    ],
  }
]

 */

import {
  assertCompositeType,
  assertNamedType,
  ASTKindToNode,
  DefinitionNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  getNullableType,
  GraphQLCompositeType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLSchema,
  InlineFragmentNode,
  isAbstractType,
  isListType,
  isObjectType,
  isScalarType,
  OperationDefinitionNode,
  SelectionSetNode,
  TypeInfo,
  visit,
  VisitFn,
  visitWithTypeInfo,
} from "graphql";
import { Maybe } from "graphql/jsutils/Maybe";
import invariant from "invariant";

import {
  createValueResolver,
  DEFAULT_MOCK_RESOLVERS,
  DEFAULT_MOCK_TYPENAME,
  MockData,
  MockResolverContext,
  MockResolvers,
  ValueResolver,
} from "./vendor/RelayMockPayloadGenerator";
export { MockResolvers } from "./vendor/RelayMockPayloadGenerator";

export interface RequestDescriptor<Node = DocumentNode> {
  readonly node: Node;
  readonly variables: Record<string, any>;
}

export interface OperationDescriptor<
  Schema = GraphQLSchema,
  Node = DocumentNode
> {
  readonly schema: Schema;
  readonly request: RequestDescriptor<Node>;
}

const TYPENAME_KEY = "__typename";

const GENERATED_FOR_TYPE_KEY = Symbol("The type this data was generated for");

interface InternalMockData extends MockData {
  [GENERATED_FOR_TYPE_KEY]: string;
}

export function generate(
  operation: OperationDescriptor,
  mockResolvers: MockResolvers | null = DEFAULT_MOCK_RESOLVERS
) {
  mockResolvers = { ...DEFAULT_MOCK_RESOLVERS, ...mockResolvers };
  const resolveValue = createValueResolver(mockResolvers);
  const definitions = operation.request.node.definitions;

  const operationDefinitionNode = definitions.find(
    (def) => def.kind === "OperationDefinition"
  ) as OperationDefinitionNode | undefined;
  invariant(operationDefinitionNode, "Expected an operation definition node");

  const result = visitDocumentDefinitionNode(
    operationDefinitionNode,
    operation.schema,
    definitions,
    mockResolvers,
    resolveValue
  )[0];
  console.log(result.selections);
  const data = {};
  result.forEach((mockData) => {
    Object.assign(data, mockData);
  });

  return { data };
}

// type Nodes = ASTKindToNode[keyof ASTKindToNode];
// type X = { [K in keyof ASTKindToNode]: { leave: VisitFn<unknown, ASTKindToNode[K]> } }
type Replace<T, K extends string, NewValue> = Omit<T, K> & Record<K, NewValue>;
type MockedSelectionSet<T> = T extends { selectionSet: SelectionSetNode }
  ? Replace<T, "selectionSet", MockData[]>
  : T;
type MockedSelectionSetFn<T> = T extends { selectionSet: SelectionSetNode }
  ? (node: Replace<T, "selectionSet", MockData[]>) => MockData[]
  : (node: T) => unknown;
type MockedVisitor = {
  [K in keyof ASTKindToNode]?: {
    // leave: (node: MockedSelectionSet<ASTKindToNode[K]>) => any;
    leave: MockedSelectionSetFn<ASTKindToNode[K]>;
  };
};

type SelectionSetMockDataFn<
  NodeName extends keyof ASTKindToNode,
  SelectionSetType,
  Node = ASTKindToNode[NodeName]
> = {
  leave: (node: Replace<Node, "selectionSet", SelectionSetType>) => MockData[];
};

type SelectionSetMockDataVisitor<
  NodeName extends keyof ASTKindToNode
> = SelectionSetMockDataFn<NodeName, MockData[]>;

function visitDocumentDefinitionNode(
  documentDefinitionNode:
    | OperationDefinitionNode
    | FragmentDefinitionNode
    | InlineFragmentNode,
  schema: GraphQLSchema,
  allDocumentDefinitionNodes: ReadonlyArray<DefinitionNode>,
  mockResolvers: MockResolvers,
  resolveValue: ValueResolver
): MockData[] {
  const typeInfo = new TypeInfo(schema);
  const visitor: {
    OperationDefinition: SelectionSetMockDataVisitor<"OperationDefinition">;
    FragmentDefinition: SelectionSetMockDataVisitor<"FragmentDefinition">;
    InlineFragment: SelectionSetMockDataVisitor<"InlineFragment">;
    FragmentSpread: SelectionSetMockDataVisitor<"FragmentSpread">;
    Field: SelectionSetMockDataFn<"Field", MockData[][]>;
    SelectionSet: any;
  } = {
    OperationDefinition: {
      leave(operationDefinitionNode) {
        return operationDefinitionNode.selectionSet;
      },
    },
    FragmentDefinition: {
      leave(fragmentDefinitionNode) {
        return fragmentDefinitionNode.selectionSet;
      },
    },
    SelectionSet: {
      leave(selectionSetNode) {
        return selectionSetNode.selections;
      },
    },
    // SelectionSet: {
    // enter(selectionSetNode) {
    //   if (isAbstractType(typeInfo.getType())) {
    //     /**
    //      * Only generate data for a single object type.
    //      */
    //     return reduceToSingleObjectTypeSelection(
    //       selectionSetNode,
    //       schema,
    //       allDocumentDefinitionNodes,
    //       typeInfo
    //     );
    //   }
    // },
    // leave(selectionSetNode) {
    //   /**
    //    * Always add __typename to object types so it's made available in cases
    //    * where an abstract parent type had a field selection for it; in which
    //    * case it needs an object type name, not the abstract type's name.
    //    */
    //   const type = typeInfo.getType();
    //   const startWith = {};
    //   // const startWith = isObjectType(type)
    //   //   ? { [TYPENAME_KEY]: type.name }
    //   //   : {};
    //   let selections = (selectionSetNode.selections as unknown[]) as InternalMockData[];
    //   // console.log(selections);
    //   if (isAbstractType(typeInfo.getType())) {
    //     let explicitTypename: string | null = null;
    //     selections.forEach((selectionSet) => {
    //       if (
    //         !selectionSet.hasOwnProperty(GENERATED_FOR_TYPE_KEY) &&
    //         selectionSet[TYPENAME_KEY]
    //       ) {
    //         explicitTypename = selectionSet[TYPENAME_KEY] as string;
    //       }
    //     });
    //     console.log({ selections, explicitTypename });
    //     // console.log({ nestedSelectionSets });
    //     selections = selections.filter((selectionSet) => {
    //       if (selectionSet.hasOwnProperty(GENERATED_FOR_TYPE_KEY)) {
    //         // When the data is a nested selection set
    //         if (selectionSet[GENERATED_FOR_TYPE_KEY] === explicitTypename) {
    //           return true;
    //         } else {
    //           return false;
    //         }
    //       } else {
    //         // When the data contains a single scalar field
    //         return true;
    //       }
    //     });
    //   }
    //   // TODO: Clean this up
    //   const data: MockData = startWith;
    //   // Record the type that this data was generated for so we can use that later on
    //   Object.defineProperty(data, GENERATED_FOR_TYPE_KEY, {
    //     enumerable: false,
    //     value: assertNamedType(typeInfo.getType()).name,
    //   });
    //   selections.forEach((selection) => {
    //     // Only leave an abstract __typename in case there's no other object __typename
    //     if (
    //       selection[TYPENAME_KEY] === DEFAULT_MOCK_TYPENAME &&
    //       selections.some(
    //         (sel) =>
    //           typeof sel[TYPENAME_KEY] === "string" &&
    //           sel[TYPENAME_KEY] !== DEFAULT_MOCK_TYPENAME
    //       )
    //     ) {
    //       selection = { ...selection };
    //       delete selection[TYPENAME_KEY];
    //     }
    //     Object.assign(data, selection);
    //   });
    //   return data;
    // },
    // },
    Field: {
      /**
       * Either produces a MockData object for a single leaf field (scalar),
       * or collects the MockData objects for a object field selection set.
       */
      leave(fieldNode) {
        const mockFieldName = fieldNode.alias?.value || fieldNode.name.value;
        const type = typeInfo.getType();
        invariant(
          type,
          `Expected field to have a type: ${JSON.stringify(fieldNode)}`
        );
        const namedType = getNamedType(type);
        if (isScalarType(namedType)) {
          return [
            {
              [mockFieldName]: mockScalar(
                fieldNode,
                namedType,
                typeInfo.getParentType()!,
                resolveValue
              ),
            },
          ];
        } else if (fieldNode.selectionSet) {
          /**
           * Reduce to a single object
           */
          const defaultData = fieldNode.selectionSet.reduce(
            (acc, x) => ({
              ...acc,
              ...x.reduce((acc2, x2) => ({ ...acc2, ...x2 }), {}),
            }),
            {}
          );
          console.log({ defaultData });
          const mockData = mockCompositeType(
            fieldNode,
            assertCompositeType(namedType),
            typeInfo.getParentType()!,
            resolveValue
          );
          const data: MockData = {};
          if (mockData) {
            // Only use fields from the mockData that were actually selected
            Object.keys(defaultData).forEach((fieldName) => {
              data[fieldName] = mockData.hasOwnProperty(fieldName)
                ? mockData[fieldName]
                : defaultData[fieldName];
            });
          } else {
            Object.assign(data, defaultData);
          }

          const isList = isListType(getNullableType(type));
          return [
            {
              [mockFieldName]: isList ? [data] : data,
            },
          ];
        }
        invariant(
          false,
          `UNHANDLED TYPE '${type}' for field '${JSON.stringify(fieldNode)}'`
        );
      },
    },
    InlineFragment: {
      /**
       * Return the MockData collected from the nested selection set.
       */
      leave(inlineFragmentNode) {
        return inlineFragmentNode.selectionSet;
      },
    },
    FragmentSpread: {
      /**
       * Return the MockData collected from the named fragment selection set.
       */
      leave(fragmentSpreadNode) {
        const fragmentDefinitionNode = findFragmentDefinitionNode(
          allDocumentDefinitionNodes,
          fragmentSpreadNode.name.value
        );
        return visitDocumentDefinitionNode(
          fragmentDefinitionNode,
          schema,
          allDocumentDefinitionNodes,
          mockResolvers,
          resolveValue
        );
      },
    },
  };
  const etc = visit(
    documentDefinitionNode,
    visitWithTypeInfo(typeInfo, visitor)
  );
  console.log({ etc });
  return etc[0];
}

/**
 * Finds the first fragment spread on an object type and keeps that plus any subsequent
 * fragment spreads for the same object type.
 */
function reduceToSingleObjectTypeSelection(
  selectionSetNode: SelectionSetNode,
  schema: GraphQLSchema,
  allDocumentDefinitionNodes: ReadonlyArray<DefinitionNode>,
  typeInfo: TypeInfo
): SelectionSetNode {
  let reduceToObjectType: GraphQLObjectType | null = null;
  const reducer = (type: Maybe<GraphQLOutputType>) => {
    if (isObjectType(type)) {
      if (!reduceToObjectType) {
        reduceToObjectType = type;
      } else if (reduceToObjectType !== type) {
        return null;
      }
    }
    return false;
  };
  return visit(
    selectionSetNode,
    visitWithTypeInfo(typeInfo, {
      InlineFragment() {
        return reducer(typeInfo.getType());
      },
      FragmentSpread(fragmentSpreadNode) {
        const fragmentDefinitionNode = findFragmentDefinitionNode(
          allDocumentDefinitionNodes,
          fragmentSpreadNode.name.value
        );
        const type = schema.getType(
          fragmentDefinitionNode.typeCondition.name.value
        );
        return reducer(type as GraphQLOutputType);
      },
    })
  );
}

function findFragmentDefinitionNode(
  allDocumentDefinitionNodes: ReadonlyArray<DefinitionNode>,
  name: string
) {
  const fragmentDefinitionNode = allDocumentDefinitionNodes.find(
    (def) => def.kind === "FragmentDefinition" && def.name.value === name
  ) as FragmentDefinitionNode | undefined;
  invariant(
    fragmentDefinitionNode,
    `Expected a fragment by name '${name}' to exist`
  );
  return fragmentDefinitionNode;
}

function mockScalar(
  fieldNode: Pick<FieldNode, "arguments" | "name" | "alias">,
  type: GraphQLScalarType,
  // type: GraphQLNamedType,
  parentType: GraphQLCompositeType,
  resolveValue: ValueResolver
) {
  if (fieldNode.name.value === TYPENAME_KEY) {
    return isAbstractType(parentType) ? DEFAULT_MOCK_TYPENAME : parentType.name;
  }
  const args =
    fieldNode.arguments &&
    fieldNode.arguments.reduce(
      (acc, arg) => ({ ...acc, [arg.name.value]: arg.value }),
      {}
    );
  const context: MockResolverContext = {
    name: fieldNode.name.value,
    alias: fieldNode.alias?.value,
    args,
    parentType: isAbstractType(parentType)
      ? DEFAULT_MOCK_TYPENAME
      : parentType.name,
  };
  return resolveValue(type.name, context, false, undefined);
}

function mockCompositeType(
  fieldNode: Pick<FieldNode, "arguments" | "name" | "alias">,
  type: GraphQLCompositeType,
  parentType: GraphQLCompositeType,
  resolveValue: ValueResolver
): MockData | undefined {
  // TODO: Coerce arg value to unboxed value
  const args =
    fieldNode.arguments &&
    fieldNode.arguments.reduce(
      (acc, arg) => ({ ...acc, [arg.name.value]: arg.value }),
      {}
    );
  const context: MockResolverContext = {
    name: fieldNode.name.value,
    alias: fieldNode.alias?.value,
    args,
    parentType: isAbstractType(parentType)
      ? DEFAULT_MOCK_TYPENAME
      : parentType.name,
  };
  const data = resolveValue(type.name, context, false, undefined) as MockData;
  // TODO: This is what they do upstream, it doesn't smell right
  if (typeof data === "object") {
    return data;
  } else {
    return undefined;
  }
}
