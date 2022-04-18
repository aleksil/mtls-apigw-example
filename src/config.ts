import * as constructs from "constructs";
import { tagResources } from "./tags";

export function applyTags(scope: constructs.Construct): void {
  tagResources(scope, (stack) => ({
    StackName: stack.stackName,
    Project: "mtls-apigw-example",
    SourceRepo: "github/aleksil/mtls-apigw-example",
  }));
}

export const accountId = "670656330697";
