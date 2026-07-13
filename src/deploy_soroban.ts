import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { 
  Horizon, 
  rpc, 
  TransactionBuilder, 
  Networks, 
  Operation, 
  Address, 
  Keypair,
  scValToNative
} from '@stellar/stellar-sdk';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const RPC_URL = 'https://soroban-testnet.stellar.org';

async function deploy() {
  console.log('🍕 PIZZA BATTLESHIP - INICIANDO DESPLIEGUE DE SOROBAN ON-CHAIN 🍕');
  
  const horizonServer = new Horizon.Server(HORIZON_URL);
  const rpcServer = new rpc.Server(RPC_URL);

  // 1. Generar o cargar llaves de despliegue
  const deployer = Keypair.random();
  const publicKey = deployer.publicKey();
  console.log(`🔑 Cuenta del Deployer: ${publicKey}`);
  console.log(`🔑 Clave secreta temporal: ${deployer.secret()}`);

  // 2. Fondear la cuenta vía Friendbot
  console.log('💧 Fondeando cuenta con Friendbot...');
  const friendbotUrl = `https://friendbot.stellar.org/?addr=${publicKey}`;
  const responseFriendbot = await fetch(friendbotUrl);
  if (!responseFriendbot.ok) {
    throw new Error('No se pudo fondear la cuenta del deployer con Friendbot.');
  }
  console.log('✅ Cuenta fondeada con éxito.');

  // Esperar indexación
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Cargar cuenta en el Horizon
  let account = await horizonServer.loadAccount(publicKey);

  // 3. Cargar el archivo WASM compilado localmente
  const wasmPath = path.join(process.cwd(), 'soroban', 'clash_of_pizzas', 'target', 'wasm32-unknown-unknown', 'release', 'clash_of_pizzas.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`No se encontró el archivo WASM en ${wasmPath}. Por favor ejecuta cargo build primero.`);
  }
  const wasmBytes = fs.readFileSync(wasmPath);
  console.log(`📦 Archivo WASM cargado. Tamaño: ${wasmBytes.length} bytes.`);

  // 4. Calcular el hash del WASM (sha256)
  const wasmHash = crypto.createHash('sha256').update(new Uint8Array(wasmBytes)).digest();
  const wasmHashHex = wasmHash.toString('hex');
  console.log(`🧮 Hash local de WASM calculado: ${wasmHashHex}`);

  // 5. Crear la transacción de Upload WASM
  console.log('📡 Construyendo transacción upload_wasm...');
  const uploadOp = Operation.uploadContractWasm({ wasm: wasmBytes });
  
  let txUpload = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET
  })
  .addOperation(uploadOp)
  .setTimeout(30)
  .build();

  // Simular la transacción para obtener recursos
  console.log('🧪 Simulando transacción upload_wasm en Soroban RPC...');
  let simUpload = await rpcServer.simulateTransaction(txUpload);
  if (rpc.Api.isSimulationSuccess(simUpload)) {
    txUpload = rpc.assembleTransaction(txUpload, simUpload).build();
    console.log('✅ Simulación de carga exitosa. Recursos ensamblados.');
  } else {
    throw new Error(`Fallo en simulación: ${JSON.stringify(simUpload)}`);
  }

  // Firmar y enviar
  txUpload.sign(deployer);
  console.log('✍️ Transacción firmada. Enviando a la red...');
  let resUpload = await rpcServer.sendTransaction(txUpload);
  if (resUpload.status === 'ERROR') {
    throw new Error(`Error al enviar: ${JSON.stringify(resUpload)}`);
  }

  console.log(`⌛ Esperando confirmación de carga de código (TxHash: ${resUpload.hash})...`);
  let statusUpload = 'NOT_FOUND';
  let txResultUpload;
  while (statusUpload === 'NOT_FOUND') {
    await new Promise(resolve => setTimeout(resolve, 1500));
    txResultUpload = await rpcServer.getTransaction(resUpload.hash);
    statusUpload = txResultUpload.status;
  }

  if (statusUpload !== 'SUCCESS') {
    throw new Error(`La carga falló con estado: ${statusUpload}. Detalles: ${JSON.stringify(txResultUpload)}`);
  }
  console.log('🎉 Código WASM cargado correctamente en Stellar Testnet.');

  // Recargar cuenta antes de la segunda tx
  account = await horizonServer.loadAccount(publicKey);

  // 6. Crear la transacción de creación del contrato
  console.log('📡 Creando instancia de contrato (create_contract)...');
  const salt = crypto.randomBytes(32);
  const createOp = Operation.createCustomContract({
    address: new Address(publicKey),
    wasmHash: wasmHash,
    salt: salt
  });

  let txCreate = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET
  })
  .addOperation(createOp)
  .setTimeout(30)
  .build();

  // Simular la creación para obtener recursos
  console.log('🧪 Simulando transacción create_contract...');
  let simCreate = await rpcServer.simulateTransaction(txCreate);
  if (rpc.Api.isSimulationSuccess(simCreate)) {
    txCreate = rpc.assembleTransaction(txCreate, simCreate).build();
    console.log('✅ Simulación de creación exitosa. Recursos ensamblados.');
  } else {
    throw new Error(`Fallo en simulación de creación: ${JSON.stringify(simCreate)}`);
  }

  // Firmar y enviar
  txCreate.sign(deployer);
  console.log('✍️ Transacción de creación firmada. Enviando...');
  let resCreate = await rpcServer.sendTransaction(txCreate);
  if (resCreate.status === 'ERROR') {
    throw new Error(`Error al enviar creación: ${JSON.stringify(resCreate)}`);
  }

  console.log(`⌛ Esperando confirmación del contrato (TxHash: ${resCreate.hash})...`);
  let statusCreate = 'NOT_FOUND';
  let txResultCreate: any;
  while (statusCreate === 'NOT_FOUND') {
    await new Promise(resolve => setTimeout(resolve, 1500));
    txResultCreate = await rpcServer.getTransaction(resCreate.hash);
    statusCreate = txResultCreate.status;
  }

  if (statusCreate !== 'SUCCESS' || !txResultCreate.returnValue) {
    throw new Error(`La creación falló con estado: ${statusCreate}. Detalles: ${JSON.stringify(txResultCreate)}`);
  }

  const contractAddress = scValToNative(txResultCreate.returnValue);
  console.log(`🏆 ¡Contrato Soroban desplegado con éxito!`);
  console.log(`🏢 Dirección del Contrato (Contract ID): ${contractAddress}`);

  // 7. Escribir el nuevo contractId de vuelta a src/stellar_config.ts
  const configPath = path.join(process.cwd(), 'src', 'stellar_config.ts');
  let configContent = fs.readFileSync(configPath, 'utf-8');
  
  // Reemplazar la línea de contractId
  configContent = configContent.replace(
    /contractId:\s*['"][^'"]+['"]/g,
    `contractId: '${contractAddress}'`
  );
  
  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log(`📝 Archivo src/stellar_config.ts actualizado con el nuevo ID de contrato.`);
}

deploy().catch(err => {
  console.error('❌ Error fatal en el despliegue:', err);
  process.exit(1);
});
