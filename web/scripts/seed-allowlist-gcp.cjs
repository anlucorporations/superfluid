const { MongoClient } = require("mongodb");
async function main() {
  const uri = "mongodb://brltv2root:kQZVICEozF8WgsbzVsehpKn2tR8B@10.132.0.3:27017/superfluid?directConnection=true&authSource=admin";
  const client = new MongoClient(uri, { appName: "seed-bootstrap" });
  await client.connect();
  const col = client.db("superfluid").collection("admin_allowlist");
  const res = await col.updateOne(
    { walletLower: "0x347789cf559a68262e4a444bc251af8d0be07ea9" },
    {
      $setOnInsert: {
        wallet: "0x347789cf559a68262e4A444bc251AF8d0bE07EA9",
        walletLower: "0x347789cf559a68262e4a444bc251af8d0be07ea9",
        rol: "admin",
        estado: "activo",
        creadoPor: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  console.log("upsert:", res.upsertedCount);
  console.log("count:", await col.countDocuments({}));
  await client.close();
}
main().catch((err) => { console.error("FALLO", err.message); process.exit(1); });
