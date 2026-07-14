package com.miraprep.resume;

import com.miraprep.config.StorageProperties;
import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.http.Method;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

/** Keeps private object-storage operations behind one small interface. */
@Service
public class ObjectStorageService {
    private final MinioClient minioClient;
    private final StorageProperties properties;

    public ObjectStorageService(MinioClient minioClient, StorageProperties properties) {
        this.minioClient = minioClient;
        this.properties = properties;
    }

    public void store(String objectKey, InputStream content, long size, String contentType) throws Exception {
        ensureBucketExists();
        minioClient.putObject(PutObjectArgs.builder()
                .bucket(properties.bucket())
                .object(objectKey)
                .stream(content, size, -1)
                .contentType(contentType)
                .build());
    }

    public String signedDownloadUrl(String objectKey) throws Exception {
        return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .method(Method.GET)
                .bucket(properties.bucket())
                .object(objectKey)
                .expiry(properties.downloadUrlExpirySeconds(), TimeUnit.SECONDS)
                .build());
    }

    public void delete(String objectKey) throws Exception {
        minioClient.removeObject(RemoveObjectArgs.builder()
                .bucket(properties.bucket())
                .object(objectKey)
                .build());
    }

    private void ensureBucketExists() throws Exception {
        if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(properties.bucket()).build())) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(properties.bucket()).build());
        }
    }
}
