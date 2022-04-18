import * as constructs from "constructs";
import * as cdk from "aws-cdk-lib";

import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";

import * as apigw from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigwauthorizers from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import * as apigwintegrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as pythonLambda from "@aws-cdk/aws-lambda-python-alpha";

import { LoadBalancedService } from "../constructs/loadbalanced-service";

interface Props extends cdk.StackProps {
  caCertificateAssetPath: string;
  serviceDockerPath: string;
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
}

export class MtlsApigwStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: Props) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {});

    // Service and ALB
    const service = new LoadBalancedService(this, "Service", {
      vpc: vpc,
      serviceDockerPath: props.serviceDockerPath,
    });

    // Certificate and custom domain for API GW
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.hostedZoneName,
      },
    );

    const caAsset = new assets.Asset(this, "TlsCaAsset", {
      path: props.caCertificateAssetPath,
      readers: [new iam.ServicePrincipal("apigateway.amazonaws.com")],
    });

    const assetBucket = s3.Bucket.fromBucketName(
      this,
      "AssetBucket",
      caAsset.s3BucketName,
    );

    const certificate = new acm.DnsValidatedCertificate(this, "Certificate", {
      domainName: props.domainName,
      hostedZone: hostedZone,
    });

    const customDomain = new apigw.DomainName(this, "ApiDomain", {
      domainName: props.domainName,
      certificate: certificate,
      mtls: {
        bucket: assetBucket,
        key: caAsset.s3ObjectKey,
      },
    });

    const lambdaAuthorizer = new pythonLambda.PythonFunction(
      this,
      "LambdaAuthorizer",
      {
        entry: "./assets/certificate-validator-lambda",
        runtime: lambda.Runtime.PYTHON_3_8,
        environment: {
          TRUSTSTORE_BUCKET: caAsset.s3BucketName,
          TRUSTSTORE_FILENAME: caAsset.s3ObjectKey,
        },
        initialPolicy: [
          new iam.PolicyStatement({
            actions: ["s3:GetObject"],
            resources: [assetBucket.arnForObjects(caAsset.s3ObjectKey)],
          }),
        ],
      },
    );

    const authorizer = new apigwauthorizers.HttpLambdaAuthorizer(
      "Authorized",
      lambdaAuthorizer,
      {
        responseTypes: [apigwauthorizers.HttpLambdaResponseType.SIMPLE],
        identitySource: [],
        resultsCacheTtl: cdk.Duration.seconds(0),
      },
    );

    const integration = new apigwintegrations.HttpAlbIntegration(
      "Integration",
      service.listener,
      {
        parameterMapping: new apigw.ParameterMapping()
          .overwriteHeader(
            "OrganizationIdentifier",
            apigw.MappingValue.contextVariable(
              "authorizer.organizationIdentifier",
            ),
          )
          .overwriteHeader(
            "CommonName",
            apigw.MappingValue.contextVariable("authorizer.commonName"),
          ),
      },
    );

    new apigw.HttpApi(this, "HttpApi", {
      defaultIntegration: integration,
      defaultDomainMapping: {
        domainName: customDomain,
      },
      defaultAuthorizer: authorizer,
      disableExecuteApiEndpoint: true,
    });

    const target = new route53targets.ApiGatewayv2DomainProperties(
      customDomain.regionalDomainName,
      customDomain.regionalHostedZoneId,
    );

    new route53.ARecord(this, "ARecord", {
      zone: hostedZone,
      recordName: props.domainName,
      ttl: cdk.Duration.minutes(5),
      target: route53.RecordTarget.fromAlias(target),
    });
  }
}
