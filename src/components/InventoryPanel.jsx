import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/components/ui/use-toast";

const LOCATIONS = ["826", "201"];

const InventoryPanel = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [updatingProducts, setUpdatingProducts] = useState({});
  const { toast } = useToast();

  const storeUrl = import.meta.env.VITE_STORE_URL || "";
  const consumerKey = import.meta.env.VITE_CONSUMER_KEY || "";
  const consumerSecret = import.meta.env.VITE_CONSUMER_SECRET || "";

  const handleApiError = (error, action) => {
    console.error(`Error ${action}:`, error);
    let errorMessage = `Failed to ${action}: ${error.message}`;
    if (error.response) {
      errorMessage += ` (Status: ${error.response.status})`;
      if (error.response.data && error.response.data.message) {
        errorMessage += ` - ${error.response.data.message}`;
      }
    }
    if (error.response && error.response.status === 401) {
      errorMessage = "Unauthorized: Please check your API credentials.";
    } else if (!storeUrl || !consumerKey || !consumerSecret) {
      errorMessage = "API configuration is missing. Please check your environment variables.";
    }
    setError(errorMessage);
    toast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!storeUrl || !consumerKey || !consumerSecret) {
        throw new Error("API configuration is missing. Please check your environment variables.");
      }

      const [productsResponse, categoriesResponse] = await Promise.all([
        fetch(
          `${storeUrl}/wp-json/wc/v3/products?status=publish&per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`
        ),
        fetch(`${storeUrl}/wp-json/wc/v3/products/categories?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`),
      ]);

      if (!productsResponse.ok || !categoriesResponse.ok) {
        if (productsResponse.status === 401 || categoriesResponse.status === 401) {
          throw new Error("Unauthorized: Please check your API credentials.");
        }
        throw new Error(`HTTP error! status: ${productsResponse.status} ${categoriesResponse.status}`);
      }

      const productsData = await productsResponse.json();
      const categoriesData = await categoriesResponse.json();

      const productsWithLocations = productsData.map((product) => ({
        ...product,
        locationAvailability: LOCATIONS.reduce((acc, location) => {
          acc[location] = product.stock_status === "instock";
          return acc;
        }, {}),
      }));

      setProducts(productsWithLocations);
      setCategories(categoriesData);
    } catch (error) {
      handleApiError(error, "fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateProductAvailability = async (productId, location, isAvailable) => {
    setUpdatingProducts((prev) => ({ ...prev, [`${productId}-${location}`]: true }));
    try {
      if (!storeUrl || !consumerKey || !consumerSecret) {
        throw new Error("API configuration is missing. Please check your environment variables.");
      }

      // Update local state first
      const updatedProducts = products.map((product) =>
        product.id === productId
          ? {
              ...product,
              locationAvailability: {
                ...product.locationAvailability,
                [location]: isAvailable,
              },
            }
          : product
      );

      const updatedProduct = updatedProducts.find((p) => p.id === productId);
      const isInStockAnywhere = Object.values(updatedProduct.locationAvailability).some((v) => v);
      const newStockStatus = isInStockAnywhere ? "instock" : "outofstock";

      console.log(`Attempting to update product ${productId} to status: ${newStockStatus}`);

      // Only update WooCommerce if the overall stock status is changing
      if (newStockStatus !== updatedProduct.stock_status) {
        // Get current product data
        const getResponse = await fetch(
          `${storeUrl}/wp-json/wc/v3/products/${productId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`
        );
        const currentProductData = await getResponse.json();
        console.log("Current product data:", currentProductData);

        if (currentProductData.type === "variable") {
          // For variable products, update each variation
          const variationUpdatePromises = currentProductData.variations.map(async (variationId) => {
            const variationResponse = await fetch(
              `${storeUrl}/wp-json/wc/v3/products/${productId}/variations/${variationId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  stock_status: newStockStatus,
                }),
              }
            );
            return variationResponse.json();
          });

          const variationResults = await Promise.all(variationUpdatePromises);
          console.log("Variation update results:", variationResults);

          // Check if all variations were updated successfully
          const allVariationsUpdated = variationResults.every((result) => result.stock_status === newStockStatus);
          if (!allVariationsUpdated) {
            throw new Error("Failed to update all variations to the desired stock status");
          }
        }

        // Update the main product
        const response = await fetch(
          `${storeUrl}/wp-json/wc/v3/products/${productId}?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              stock_status: newStockStatus,
            }),
          }
        );

        const responseData = await response.json();
        console.log("Server response after update:", responseData);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}, message: ${responseData.message || "Unknown error"}`);
        }

        if (responseData.stock_status !== newStockStatus) {
          throw new Error(
            `Failed to update product status on the server. Expected ${newStockStatus}, but got ${
              responseData.stock_status
            }. Full response: ${JSON.stringify(responseData)}`
          );
        }

        updatedProduct.stock_status = newStockStatus;
      } else {
        console.log(`No need to update WooCommerce. Product ${productId} remains ${updatedProduct.stock_status}`);
      }

      setProducts(updatedProducts);
      toast({
        title: "Success",
        description: `Updated ${location} to ${isAvailable ? "in stock" : "out of stock"}: ${updatedProduct.name}`,
      });
    } catch (error) {
      console.error("Detailed error:", error);
      handleApiError(error, `update product ${productId} for location ${location}`);
    } finally {
      setUpdatingProducts((prev) => ({ ...prev, [`${productId}-${location}`]: false }));
    }
  };

  const groupProductsByCategory = () => {
    const grouped = {};
    categories.forEach((category) => {
      grouped[category.id] = {
        name: category.name,
        products: products.filter((product) => product.categories.some((cat) => cat.id === category.id)),
      };
    });
    return grouped;
  };

  const groupedProducts = groupProductsByCategory();

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl sm:text-2xl">Bakery Inventory Management</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading..." : "Refresh Products"}
        </Button>
        {error && <p className="text-red-500 mt-4">{error}</p>}
        {Object.entries(groupedProducts).length > 0 && (
          <Accordion type="single" collapsible className="mt-4">
            {Object.entries(groupedProducts).map(([categoryId, category]) => (
              <AccordionItem value={categoryId} key={categoryId}>
                <AccordionTrigger className="text-sm sm:text-base">{category.name}</AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Product Name</TableHead>
                          <TableHead className="text-xs sm:text-sm">Online Status</TableHead>
                          {LOCATIONS.map((location) => (
                            <TableHead key={location} className="text-xs sm:text-sm">
                              {location}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {category.products.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell className="text-xs sm:text-sm">{product.name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {product.stock_status === "instock" ? "In Stock" : "Out of Stock"}
                            </TableCell>
                            {LOCATIONS.map((location) => (
                              <TableCell key={`${product.id}-${location}`}>
                                <Switch
                                  checked={product.locationAvailability[location]}
                                  onCheckedChange={(checked) => updateProductAvailability(product.id, location, checked)}
                                  disabled={updatingProducts[`${product.id}-${location}`]}
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

export default InventoryPanel;
