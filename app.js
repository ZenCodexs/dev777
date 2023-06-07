const fastify = require('fastify')();
const cron = require('node-cron');
const axios = require('axios');
const XLSX = require('xlsx');
const cache = require('memory-cache');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config({ path: './.env' });
const AWS = require('aws-sdk');
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client();
const bucketName = process.env.BUCKET_NAME;

const app = fastify.server;

const urlagrolalibertad = 'http://www.agrolalibertad.gob.pe/index.php?q=node/152';
const serverUrl = process.env.SERVER_URL;

const options = {
  // Opciones de configuración del servidor Fastify
  port: 3000, // Reemplaza 3000 con el puerto que desees utilizar
};

// Función para verificar si es un número
function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

// Función para encontrar la posición de un valor en una hoja
function findCellValuePosition(sheet, targetValue) {
  const range = sheet['!ref'];
  const [startCell, endCell] = range.split(':');
  const startRow = parseInt(startCell.match(/\d+/)[0]);
  const endRow = parseInt(endCell.match(/\d+/)[0]);

  for (let row = startRow; row <= endRow; row++) {
    const cellAddress = `A${row}`;
    const cellValue = sheet[cellAddress]?.v;

    if (cellValue === targetValue) {
      return row;
    }
  }

  return -1; // El valor no se encontró en la hoja
}

fastify.get('/data', async (request, reply) => {
  try {

    //=============================================================================================

async function borrarContenidoJSON() {
  try {
    const fileName = "data.json";
    // Descargar el archivo JSON desde S3
    const params = { Bucket: bucketName, Key: fileName };
    const { Body } = await s3Client.send(new GetObjectCommand(params));
    const jsonDataString = Body.toString("utf-8");

    // Parsear el contenido del archivo JSON
    let jsonData;
    try {
      jsonData = JSON.parse(jsonDataString);
    } catch (parseError) {
      console.error("Error al analizar el JSON descargado:", parseError);
      console.log("Contenido del JSON:", jsonDataString);
      return;
    }

    // Borrar el contenido existente en el objeto JSON
    jsonData = {};

    // Convertir el objeto JSON modificado a formato de cadena
    const updatedJsonDataString = JSON.stringify(jsonData, null, 2);

    // Sobrescribir el archivo JSON en S3 con el contenido actualizado
    const putParams = {
      Bucket: bucketName,
      Key: fileName,
      Body: updatedJsonDataString,
      ContentType: "application/json",
    };
    await s3Client.send(new PutObjectCommand(putParams));

    console.log("Contenido del archivo JSON borrado exitosamente.");
  } catch (error) {
    console.error("Error al borrar el contenido del archivo JSON:", error);
  }
}

borrarContenidoJSON();

    //=============================================================================================
    const params = {
      Bucket: bucketName,
      Key: 'data.json',
    };

    const data = await s3Client.send(new GetObjectCommand(params));
    const jsonDataString = data.Body.toString();
    const jsonData = JSON.parse(jsonDataString);

    reply.send(jsonData);
  } catch (error) {
    console.error('Error al descargar el archivo JSON de S3:', error);
    reply.status(500).send({ error: 'Error al obtener los datos' });
  }
});

fastify.get('/cronTask', async (request, reply) => {
  await fetchDataAndSaveToJson();
  reply.send('Tarea programada ejecutada');
});

fastify.listen(options, (err, address) => {
  if (err) {
    console.error('Error al iniciar el servidor Fastify:', err);
    process.exit(1);
  }
  console.log(`Servidor Fastify iniciado en el puerto ${options.port}`);
});

// Obtener los datos y guardarlos en un archivo JSON
const fetchDataAndSaveToJson = async () => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const months = [
    'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
    'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'
  ];
  const meses = months.slice(0, currentMonth + 1);

  try {
    const response = await axios.get(urlagrolalibertad);
    const html = response.data;
    const $ = cheerio.load(html);
    const table = $('table.tabla', '#block-system-main').first();
    const sheet = XLSX.utils.table_to_sheet(table);
    const jsonData = {};

    meses.forEach((mes) => {
      const row = findCellValuePosition(sheet, mes);

      if (row !== -1) {
        const fechaCell = `A${row}`;
        const fecha = sheet[fechaCell]?.v;
        const precios = {};

        for (let col = 1; col <= 6; col++) {
          const productoCell = `${XLSX.utils.encode_col(col)}${row}`;
          const precioCell = `${XLSX.utils.encode_col(col)}${row + 1}`;
          const producto = sheet[productoCell]?.v;
          const precio = sheet[precioCell]?.v;

          if (producto && precio && isNumeric(precio)) {
            precios[producto] = precio;
          }
        }

        jsonData[fecha] = precios;
      }
    });

    // Guardar el archivo JSON en S3
    const jsonDataString = JSON.stringify(jsonData);

    const params = {
      Bucket: bucketName,
      Key: 'data.json',
      Body: jsonDataString,
      ContentType: 'application/json',
    };

    await s3Client.send(new PutObjectCommand(params));
    console.log('Datos guardados en S3');
  } catch (error) {
    console.error('Error al obtener los datos:', error);
  }
};

// Programar tarea cron para ejecutar cada día a las 12:00 AM
cron.schedule('0 0 * * *', async () => {
  await fetchDataAndSaveToJson();
});

// Ejecutar la función para obtener los datos iniciales al iniciar el servidor
fetchDataAndSaveToJson().catch((error) => {
  console.error('Error al obtener los datos iniciales:', error);
});
