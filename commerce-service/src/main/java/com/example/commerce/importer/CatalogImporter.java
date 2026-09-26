package com.example.commerce.importer;

import com.example.commerce.common.CommerceProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs under the {@code import} profile, then the process exits. The whole import is one
 * transaction. With {@code commerce.import.reset-inventory=true} it also deletes every
 * order and restores the authored stock, so stock plus quantities ordered always equals
 * the authored stock.
 */
@Component
@Profile("import")
public class CatalogImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogImporter.class);

    private final ImportMapper rows;
    private final TransactionTemplate transaction;
    private final ObjectMapper json;
    private final Path dataDir;
    private final boolean resetInventory;

    public CatalogImporter(
            ImportMapper rows,
            TransactionTemplate transaction,
            ObjectMapper json,
            CommerceProperties properties,
            @Value("${commerce.import.reset-inventory:false}") boolean resetInventory) {
        this.rows = rows;
        this.transaction = transaction;
        this.json = json;
        this.dataDir = Path.of(properties.dataDir());
        this.resetInventory = resetInventory;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        CatalogSeed seed = new CatalogSeed(dataDir, json);
        transaction.executeWithoutResult(status -> {
            seed.products.forEach(rows::upsertProduct);
            seed.skus.forEach(rows::upsertSku);
            seed.policies.forEach(rows::upsertPolicy);
            if (resetInventory) {
                rows.deleteOrderItems();
                int orders = rows.deleteOrders();
                seed.stock.forEach(rows::resetStock);
                log.info("Deleted {} orders and restored the authored stock", orders);
            } else {
                seed.stock.forEach(rows::insertStock);
            }
        });
        log.info("Imported {} products, {} SKUs and {} policies",
                seed.products.size(), seed.skus.size(), seed.policies.size());
    }
}
