import { KVNamespace, D1Database, R2Bucket, ImagesBinding } from "@cloudflare/workers-types";

export interface CloudflareBindings extends Cloudflare.Env {
    IMAGES: ImagesBinding;
    IMAGES_BUCKET: R2Bucket;
    prod_plurr: D1Database;
    dev_plurr: D1Database;
    KV_USERS: KVNamespace;
}