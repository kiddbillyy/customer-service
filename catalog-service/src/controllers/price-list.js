const listPriceService = require('../models/pricelistmodel');

async function getListPrices(req, res) {
    const page = parseInt(req.query.page) || 1; 
    const pageSize = parseInt(req.query.pageSize) || 100;
    const itemCode = req.query.itemCode || null;
    const priceList = req.query.priceList !== undefined ? parseInt(req.query.priceList) : null;
    const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice) : null;

    const sortBy = req.query.sortBy || 'ItemCode';
    const sortOrder = req.query.sortOrder || 'ASC';  

    if (page < 1 || pageSize < 1 || pageSize > 500) {
        return res.status(400).json({ 
            message: 'Parámetros de paginación inválidos. Page y pageSize deben ser números positivos, y pageSize no puede exceder 500.' 
        });
    }
    if (req.query.priceList !== undefined && isNaN(priceList)) {
        return res.status(400).json({ message: 'El parámetro priceList debe ser un número válido.' });
    }
    if (req.query.minPrice !== undefined && isNaN(minPrice)) {
        return res.status(400).json({ message: 'El parámetro minPrice debe ser un número válido.' });
    }
    if (req.query.maxPrice !== undefined && isNaN(maxPrice)) {
        return res.status(400).json({ message: 'El parámetro maxPrice debe ser un número válido.' });
    }

    try {
        const result = await listPriceService.getListPrices({
            page,
            pageSize,
            itemCode,
            priceList,
            minPrice,
            maxPrice,
            sortBy,
            sortOrder
        });

        res.json(result);
    } catch (error) {
        console.error('Error en el controlador getListPrices:', error);
        res.status(500).json({ message: error.message || 'Error interno del servidor al obtener la lista de precios.' });
    }
}


async function getListPriceById(req, res) {
    const itemCode = req.params.itemCode;
    const priceList = parseInt(req.params.priceList);

    if (!itemCode) {
        return res.status(400).json({ message: 'El parámetro ItemCode es requerido.' });
    }
    if (isNaN(priceList)) {
        return res.status(400).json({ message: 'El parámetro PriceList debe ser un número válido.' });
    }

    try {
        const listPrice = await listPriceService.getListPriceById(itemCode, priceList);

        if (listPrice) {
            res.json(listPrice);
        } else {
            res.status(404).json({ message: 'Precio de lista no encontrado para el ItemCode y PriceList proporcionados.' });
        }
    } catch (error) {
        console.error('Error en el controlador getListPriceById:', error);
        res.status(500).json({ message: error.message || 'Error interno del servidor al obtener el precio de lista por ID.' });
    }
}

module.exports = {
    getListPrices,
    getListPriceById
};