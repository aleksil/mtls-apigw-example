import * as cdk from "aws-cdk-lib";
import { accountId, applyTags } from "./config";
import { MtlsApigwStack } from "./stacks/mtls-apigw-stack";

const app = new cdk.App();

applyTags(app);

new MtlsApigwStack(app, "mtls-apigw-stack", {
  env: {
    account: accountId,
    region: "eu-west-1",
  },
  caCertificateAssetPath: "./assets/buypass-test-root.pem",
  serviceDockerPath: "./assets/example-service",
  domainName: "apigw.aws.luukkonen.no",
  hostedZoneId: "Z012784915AFJ9P29B06T",
  hostedZoneName: "aws.luukkonen.no",
});
