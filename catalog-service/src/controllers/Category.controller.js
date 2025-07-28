const { buscarCategorias, buscarPrimerNivel,buscarSubcategoriasPorCategoria, obtenerArbolCategoriasDB  } = require('../models/CategoryModels');

// Controller: recibe la petición HTTP
const obtenerCategorias = async (req, res) => {
  try {
    const { buscar } = req.query;
    const categorias = await buscarCategorias(buscar);

    res.status(200).json(categorias);
  } catch (error) {
    console.error('❌ Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al obtener las categorías' });
  }
};

//CONTROLLER: BUSCAR POR PRIMER NIVEL 

const obtenerPrimerNivel = async (req, res) => {
  try {
    const { buscar } = req.query;
    const niveles = await buscarPrimerNivel(buscar);

    res.status(200).json(niveles);
  } catch (error) {
    console.error('❌ Error al obtener primer nivel:', error);
    res.status(500).json({ error: 'Error al obtener los datos de primer nivel' });
  }
};

// Función para quitar tildes y convertir a minúsculas

const removeAccents = (text) =>
  text?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

//CONTROLLER: OBTENER DETALLE CATEGORIAS

const obtenerSubcategorias = async (req, res) => {
  try {
    const { id } = req.params;
    const datos = await buscarSubcategoriasPorCategoria(id);

    if (datos.length === 0) {
      return res.status(404).json({ error: 'No se encontraron subcategorías para esta categoría' });
    }

    const { primernivel, categoria } = datos[0];

    const subcategorias = datos.map(d => ({
      reference: d.subcategoria_code,
      name: d.subcategoria_name,
      nameTree: `${d.primernivel} > ${d.categoria} > ${d.subcategoria_name}`,
      date_modified: d.data_modified,
      user_modified: d.user_modified,
      status: d.status === 'Y' ? 'Active' : 'Inactive'
    }));

    res.status(200).json({
      primernivel,
      categoria,
      subcategorias
    });

  } catch (error) {
    console.error('❌ Error al obtener subcategorías:', error);
    res.status(500).json({ error: 'Error al obtener subcategorías' });
  }
};

//CONTROLLER: OBTENER ARBOL DE CATEGORIAS
const obtenerArbolCategorias = async (req, res) => {
  try {
    const raw = await obtenerArbolCategoriasDB();

    const datos = raw.map(item => {
      const name = item.subcategory_name || item.category_name;
      const reference = item.subcategory_code || item.category_code;

      let nameTree = item.first_level_name;
      if (item.category_name) nameTree += ` > ${item.category_name}`;
      if (item.subcategory_name) nameTree += ` > ${item.subcategory_name}`;

      return {
        name,
        reference,
        nameTree,
        date_modified: item.data_modified,
        user_modified: item.user_modified,
        status: item.status === 'Y' ? 'Active' : 'Inactive'
      };
    });

    // 🧠 Búsquedas independientes por campo
    const searchName = removeAccents(req.query.buscarname || '');
    const searchReference = removeAccents(req.query.buscarreference || '');
    const searchNameTree = removeAccents(req.query.buscarnametree || '');

    let filtrados = datos;

    if (searchName) {
      filtrados = filtrados.filter(item =>
        removeAccents(item.name).includes(searchName)
      );
    }

    if (searchReference) {
      filtrados = filtrados.filter(item =>
        removeAccents(item.reference).includes(searchReference)
      );
    }

    if (searchNameTree) {
      filtrados = filtrados.filter(item =>
        removeAccents(item.nameTree).includes(searchNameTree)
      );
    }

    // 🔠 Ordenar alfabéticamente por nameTree
    filtrados.sort((a, b) => a.nameTree.localeCompare(b.nameTree));

    // 📄 Paginación
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 40;
    const total = filtrados.length;
    const totalPages = Math.ceil(total / pageSize);

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = filtrados.slice(start, end);

    res.status(200).json({
      page,
      pageSize,
      total,
      totalPages,
      data: paginated
    });
  } catch (error) {
    console.error('❌ Error al obtener árbol de categorías:', error);
    res.status(500).json({ error: 'Error al obtener árbol de categorías' });
  }
};


module.exports = { obtenerCategorias, obtenerPrimerNivel, obtenerSubcategorias, obtenerArbolCategorias };
