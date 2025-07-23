const GetPool = require('../config/db'); 
const sql = require('mssql');

async function getListPrices(options) {
    const {
        page = 1,
        pageSize = 100,
        itemCode = null,
        priceList = null,
        minPrice = null,
        maxPrice = null,
        sortBy = 'ItemCode',
        sortOrder = 'ASC'
    } = options;

    try {
        const pool = await GetPool;
        const request = pool.request();

        let conditions = [];
        let query = `
            SELECT ItemCode, PriceList, Price, CreatedAt, UpdatedAt
            FROM dbo.ITM1_ListPrice
        `;

        if (itemCode) {
            conditions.push(`ItemCode LIKE @itemCode`); 
            request.input('itemCode', sql.NVarChar(50), `%${itemCode}%`); 
        }
        if (priceList !== null && priceList !== undefined) {
            conditions.push(`PriceList = @priceList`);
            request.input('priceList', sql.SmallInt, priceList);
        }
        if (minPrice !== null && minPrice !== undefined) {
            conditions.push(`Price >= @minPrice`);
            request.input('minPrice', sql.Numeric(19,6), minPrice);
        }
        if (maxPrice !== null && maxPrice !== undefined) {
            conditions.push(`Price <= @maxPrice`);
            request.input('maxPrice', sql.Numeric(19,6), maxPrice);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        const validSortColumns = ['ItemCode', 'PriceList', 'Price', 'CreatedAt', 'UpdatedAt'];
        const validatedSortBy = validSortColumns.includes(sortBy) ? sortBy : 'ItemCode';
        const validatedSortOrder = (sortOrder.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

        query += ` ORDER BY ${validatedSortBy} ${validatedSortOrder}`;

        const offset = (page - 1) * pageSize;
        query += ` OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`;
        
        request.input('offset', sql.Int, offset);
        request.input('pageSize', sql.Int, pageSize);

        let countQuery = `SELECT COUNT(*) AS totalRecords FROM dbo.ITM1_ListPrice`;
        if (conditions.length > 0) {
            countQuery += ` WHERE ` + conditions.join(' AND ');
        }
        const countResult = await request.query(countQuery);
        const totalRecords = countResult.recordset[0].totalRecords;

        const result = await request.query(query);

        return {
            page,
            pageSize,
            totalRecords,
            totalPages: Math.ceil(totalRecords / pageSize),
            data: result.recordset
        };

    } catch (error) {
        console.error(`Error en getListPrices: ${error.message}`);
        throw new Error(`No se pudo obtener la lista de precios: ${error.message}`);
    }
}

async function getListPriceById(itemCode, priceList) {
    try {
        const pool = await GetPool;
        const result = await pool.request()
            .input('itemCode', sql.NVarChar(50), itemCode)
            .input('priceList', sql.SmallInt, priceList)
            .query(`
                SELECT ItemCode, PriceList, Price, CreatedAt, UpdatedAt
                FROM dbo.ITM1_ListPrice
                WHERE ItemCode = @itemCode AND PriceList = @priceList;
            `);
            
        return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
        console.error(`Error en getListPriceById: ${error.message}`);
        throw new Error(`No se pudo obtener el precio por ID: ${error.message}`);
    }
}

module.exports = {
    getListPrices,
    getListPriceById
};