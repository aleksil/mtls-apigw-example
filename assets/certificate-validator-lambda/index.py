import json
import os
from certvalidator import CertificateValidator, ValidationContext, errors
import boto3
from asn1crypto import pem, x509

'''
Let's load our truststore from s3. Doing this outside of handler function so that this will be loaded only on coldstart.
If the truststore contents change, you need to update the lambda env var 'TRUSTSTORE_FILE_VERSIONID'
with the new files versionId. And also update the same in 'API Gateway > Custom domain names > Domain details > Truststore version' and wait till Status becomes Available.
If APi Gateway finds some problem with the truststore, such as could not find complete chain, it will display a warning. The warning details will tell you which cert it has a problem with and the problem. You need to fix the truststore chain till this warning goes away.
'''

s3_client = boto3.client('s3')

bucket = os.environ.get('TRUSTSTORE_BUCKET')
key = os.environ.get('TRUSTSTORE_FILENAME')

download_path = '/tmp/{}'.format(key)
s3_client.download_file(bucket, key, download_path)

trust_roots = []
with open(download_path, 'rb') as f:
    for _, _, der_bytes in pem.unarmor(f.read(), multiple=True):
        trust_roots.append(der_bytes)


def handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))
    ''' Get the client cert from lambda event '''
    cert = event["requestContext"]["authentication"]["clientCert"]["clientCertPem"].encode()

    '''
    hard-fail mode, any error in checking revocation is considered a failure. However, if there is no known source of revocation information, it is not considered a failure.
    This allows us to keep using self signed certs too.
    '''
    context = ValidationContext(
        allow_fetching=True, revocation_mode="hard-fail", trust_roots=trust_roots)

    try:
        validator = CertificateValidator(cert, validation_context=context)
        validator.validate_usage(
            set(['digital_signature', 'key_encipherment'])
        )
    except Exception as inst:
        print(inst)
        print("The certificate could not be validated")
        return {
            "isAuthorized": "false",
            "context": {
                "exception": str(inst.args)
            }
        }
    else:
        print("The certificate is ok")
        _, _, cert_bytes = pem.unarmor(cert)
        cert_data = x509.Certificate.load(cert_bytes)
        subject = cert_data.subject.native
        return {
            "isAuthorized": "true",
            "context": {
                "exception": None,
                "commonName": subject["common_name"],
                "organizationIdentifier": subject["organization_identifier"]
            }
        }
