const fastify = require('fastify')();
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const XLSX = require('xlsx');
const cache = require('memory-cache');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config({ path: './.env' });
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client();

const app = express();
const urlagrolalibertad = 'http://www.agrolalibertad.gob.pe/index.php?q=node/152';
const serverUrl = process.env.SERVER_URL;


const bucketName = process.env.BUCKET_NAME;
const keyName = 'data.json';

const options = {
  // Opciones de configuración del servidor Fastify
  port: 3000, // Reemplaza 3000 con el puerto que desees utilizar
};


// En lugar de leer localmente el archivo JSON, lo descargamos de S3
const params11 = {
  Bucket: bucketName,
  Key: 'data.json',
};


let jsonData = {
  añoactual: {},
  añoanterior: {}
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
  const params1 = {
    Bucket: bucketName,
    Key: 'data.json',
  };

  try {
    const data = await s3Client.send(new GetObjectCommand(params1));
    const jsonDataString = data.Body.toString();
    const jsonData = JSON.parse(jsonDataString);
    reply.send(jsonData);
  } catch (err) {
    console.error('Error al descargar el archivo JSON de S3:', err);
    reply.status(500).send({ error: 'Error al obtener los datos' });
  }
});



fastify.get('/cronTask', (request, reply) => {
  fetchDataAndSaveToJson();
  //reply.send('Tarea programada ejecutada');
});

const port = 3000;




fastify.listen(options, (err, address) => {
  if (err) {
    console.error('Error al iniciar el servidor Fastify:', err);
    process.exit(1);
  }
  console.log(`Servidor Fastify iniciado en el puerto ${port}`);
});

// Obtener los datos y guardarlos en un archivo JSON
const fetchDataAndSaveToJson = async () => {

  try {

    const sheetName = 'FEB';
    //const startCell = 'B7';
    //const endCell = 'S7';
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const months = [
      'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
      'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'
    ];
    const meses = months.slice(0, currentMonth + 1);
  
    //====================================================================================================
    axios.get(urlagrolalibertad)
      .then(response => {
          const html = response.data;
          const $ = cheerio.load(html);
  
          // Buscar la tabla con el id "attachments"
          const attachmentsTable = $('#attachments');
  
          // Obtener los enlaces de la tabla de "attachments"
          const links = [];
          attachmentsTable.find('tbody tr').each((index, element) => {
          const linkElement = $(element).find('a');
          const link = linkElement.attr('href');
          links.push(link);
          });
  
          // Obtener los dos últimos enlaces
          const url = links[links.length - 1];
          const urlAñoAnterior = links[links.length - 2];
  
          //console.log('URL actual del año:', urlactualyear);
          //console.log('URL del año anterior:', previousyear);
  
  
          axios.get(url, { responseType: 'arraybuffer' })
          .then(response => {
          const workbook = XLSX.read(response.data, { type: 'buffer' });
  
          const jsonData = {
              añoactual: {},
              añoanterior: {}
          };
  
  
  
          
  
  
  
  
          for (let i = 0; i < meses.length; i++) {
              const sheetName = meses[i];
              const sheet = workbook.Sheets[sheetName];
              //====================================================================================================
              const viruRow = findCellValuePosition(sheet, 'VIRU');
              const startCell = `B${viruRow - 2}`;
              const endCell = `S${viruRow - 2}`;
              //====================================================================================================
              const range = XLSX.utils.decode_range(`${startCell}:${endCell}`);
              let count = 0;
  
              for (let R = range.s.r; R <= range.e.r; ++R) {
              for (let C = range.s.c; C <= range.e.c; ++C) {
                  const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                  const cell = sheet[cellAddress];
  
                  if (cell && cell.v) {
                  const cellValue = cell.v;
  
                  if (isNumeric(cellValue)) {
                      count++;
                  }
                  }
              }
              }
  
              const dias = [];
              for (let i = 1; i <= count; i++) {
              const cell = sheet[XLSX.utils.encode_cell({ r: viruRow-3, c: i })];
              if (cell && cell.v) {
                  dias.push(cell.v);
              }
              }
  
              const preciosValleA9 = [];
              for (let i = 1; i <= count; i++) {
              const cell = sheet[XLSX.utils.encode_cell({ r: viruRow-1, c: i })];
              if (cell && cell.v) {
                  preciosValleA9.push({ fecha: dias[i - 1], precio: cell.v });
              }
              }
  
              const preciosValleA10 = [];
              for (let i = 1; i <= count; i++) {
              const cell = sheet[XLSX.utils.encode_cell({ r: viruRow+1, c: i })];
              if (cell && cell.v) {
                  preciosValleA10.push({ fecha: dias[i - 1], precio: cell.v });
              }
              }
  
              const preciosValleA11 = [];
              for (let i = 1; i <= count; i++) {
              const cell = sheet[XLSX.utils.encode_cell({ r: 10, c: i })];
              if (cell && cell.v) {
                  preciosValleA11.push({ fecha: dias[i - 1], precio: cell.v });
              }
              }
  
              jsonData.añoactual[meses[i]] = {
              VIRU: preciosValleA9,
              CHICAMA: preciosValleA10,
              MOCHE: preciosValleA11
              };
          }
  
          const añoanterior = {};
          //const urlAñoAnterior = 'http://www.agrolalibertad.gob.pe/sites/default/files/PRECIOS_MAIZ_AMARILLO_DURO_VIRU-ASCOPE_ANO_2022_0.xlsx';
          //const startCellAñoAnterior = 'B7';
          //const endCellAñoAnterior = 'S7';
          const monthsAñoAnterior = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
  
          axios.get(urlAñoAnterior, { responseType: 'arraybuffer' })
          .then(async response => {
              const workbook = XLSX.read(response.data, { type: 'buffer' });
  
  
              // Objeto para almacenar los datos de los meses
              //const jsonData = {};
  
              // Iterar sobre cada mes
              for (let i = 0; i < monthsAñoAnterior.length; i++) {
                  const sheetName = monthsAñoAnterior[i];
                  const sheet = workbook.Sheets[sheetName];
                  //====================================================================================================
                  const viruRow = findCellValuePosition(sheet, 'VIRU');
                  const startCellAñoAnterior = `B${viruRow - 2}`;
                  const endCellAñoAnterior  = `S${viruRow - 2}`;
                  //====================================================================================================
  
  
  
              // Verificar si la hoja existe en el archivo
              if (sheet) {
                  // Obtener el rango de celdas
                  const range = XLSX.utils.decode_range(`${startCellAñoAnterior}:${endCellAñoAnterior}`);
  
                  // Contador para almacenar la cantidad de celdas con números
                  let count = 0;
  
                  // Iterar sobre las celdas en el rango
                  for (let R = range.s.r; R <= range.e.r; ++R) {
                  for (let C = range.s.c; C <= range.e.c; ++C) {
                      // Construir el nombre de la celda
                      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
  
                      // Obtener la celda
                      const cell = sheet[cellAddress];
  
                      // Verificar si la celda existe y tiene un valor
                      if (cell && cell.v) {
                      // Obtener el valor de la celda
                      const cellValue = cell.v;
  
                      // Verificar si el valor de la celda es un número
                      if (isNumeric(cellValue)) {
                          count++;
                      }
                      }
                  }
                  }
  
                  // Obtener los días desde las celdas C7 a N7
                  const dias = [];
                  for (let i = 1; i <= count; i++) {
                  const cell = sheet[XLSX.utils.encode_cell({ r: viruRow-3, c: i })];
                  if (cell && cell.v) {
                      dias.push(cell.v);
                  }
                  }
  
                  // Obtener los precios para el valle A9 desde las celdas C9 a N9
                  const preciosValleA9 = [];
                  for (let i = 1; i <= count; i++) {
                  const cell = sheet[XLSX.utils.encode_cell({ r: viruRow-1, c: i })];
                  if (cell && cell.v) {
                      preciosValleA9.push({ fecha: dias[i - 1], precio: cell.v });
                  }
                  }
  
                  // Obtener los precios para el valle A10 desde las celdas C10 a N10
                  const preciosValleA10 = [];
                  for (let i = 1; i <= count; i++) {
                  const cell = sheet[XLSX.utils.encode_cell({ r: viruRow, c: i })];
                  if (cell && cell.v) {
                      preciosValleA10.push({ fecha: dias[i - 1], precio: cell.v });
                  }
                  }
  
                  // Obtener los precios para el valle A11 desde las celdas C11 a N11
                  const preciosValleA11 = [];
                  for (let i = 1; i <= count; i++) {
                  const cell = sheet[XLSX.utils.encode_cell({ r: viruRow+1, c: i })];
                  if (cell && cell.v) {
                      preciosValleA11.push({ fecha: dias[i - 1], precio: cell.v });
                  }
                  }
  
                  // Almacenar los datos en el objeto jsonData
                  jsonData.añoanterior[months[i]] = {
                  VIRU: preciosValleA9,
                  CHICAMA: preciosValleA10,
                  MOCHE: preciosValleA11
                  };
              }
              }
  
              //jsonData.añoanterior = añoanterior;
  
              cache.put('data', jsonData, 30 * 60 * 1000);
  
              const jsonDataString = JSON.stringify(jsonData, null, 2);
              const params = {
                Bucket: bucketName,
                Key: 'data.json',
                Body: jsonDataString,
              };
            
              try {
                const data = await s3Client.send(new PutObjectCommand(params));
                console.log('Archivo JSON actualizado correctamente en S3:', data.Location);
                reply.send({ message: 'Archivo JSON actualizado correctamente en S3' });
              } catch (err) {
                console.error('Error al cargar el archivo JSON en S3:', err);
                reply.status(500).send({ error: 'Error al cargar el archivo JSON en S3' });
              }
              
              })
              .catch(error => {
              console.log('Error al descargar el archivo del año anterior:', error);
             
              });
          })
          .catch(error => {
          console.log('Error al descargar el archivo actual:', error);
          
          });
  
  
  
      })
      .catch(error => {
          console.error('Error al hacer la solicitud:', error);
      });
    
  } catch (error) {
    console.error(error);
    
  }
  
};

// Ejecutar la función fetchDataAndSaveToJson al iniciar el servidor
fetchDataAndSaveToJson();
