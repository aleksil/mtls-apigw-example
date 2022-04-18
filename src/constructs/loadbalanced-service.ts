import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";

interface Props {
  vpc: ec2.IVpc;
  serviceDockerPath: string;
}

export class LoadBalancedService extends constructs.Construct {
  readonly cluster: ecs.Cluster;
  readonly alb: elb.ApplicationLoadBalancer;
  readonly listener: elb.ApplicationListener;

  constructor(scope: constructs.Construct, id: string, props: Props) {
    super(scope, id);

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
    });

    this.alb = new elb.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc: props.vpc,
      internetFacing: false,
    });

    this.listener = this.alb.addListener("Listener", {
      port: 80,
      open: true,
    });

    const taskDefinition = new ecs.TaskDefinition(this, "TaskDefinition", {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: "256",
      memoryMiB: "512",
      networkMode: ecs.NetworkMode.AWS_VPC,
    });
    taskDefinition.addContainer("Container", {
      image: ecs.ContainerImage.fromAsset(props.serviceDockerPath),
      portMappings: [
        {
          containerPort: 8080,
        },
      ],
    });

    const fargateService = new ecs.FargateService(this, "Task", {
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      enableExecuteCommand: true,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
      desiredCount: 1,
    });

    const targetGroup = new elb.ApplicationTargetGroup(this, "TargetGroup", {
      vpc: props.vpc,
      targetType: elb.TargetType.IP,
      protocol: elb.ApplicationProtocol.HTTP,
      port: 8080,
      deregistrationDelay: cdk.Duration.seconds(5),
    });
    fargateService.attachToApplicationTargetGroup(targetGroup);

    this.listener.addTargetGroups("TargetGroup", {
      targetGroups: [targetGroup],
    });
  }
}
