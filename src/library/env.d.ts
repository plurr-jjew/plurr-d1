import { KVNamespace, D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface CloudflareBindings extends Cloudflare.Env {
    IMAGES: any;
    IMAGES_BUCKET: R2Bucket;
    prod_plurr: D1Database;
    dev_plurr: D1Database;
    KV_USERS: KVNamespace;
}